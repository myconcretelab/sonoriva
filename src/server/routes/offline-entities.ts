import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { categories, offlineEntityDeletions, playlistItems, playlists, projects, tracks, trackSubcategories } from '../db/schema.js';
import { requireUser } from '../services/auth.js';
import { canAccessProject } from '../services/ownership.js';
import { accountForUserProject } from '../services/accounts.js';
import { planFeatures } from '../services/commercial-plans.js';
import { playlistRowsAreValid } from '../services/playlist-rows.js';
import { backgroundImageSchema } from '../services/background-image.js';
import { categoryKeys, entityChanges, mergeEntity, playlistKeys } from '../shared/offline-entities.js';

const categorySchema = z.object({ id: z.string().uuid(), projectId: z.string().uuid(), name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), position: z.number().int().min(0).max(1_000_000), backgroundImage: backgroundImageSchema.optional().default(null) });
const playlistSchema = z.object({ id: z.string().uuid(), projectId: z.string().uuid(), name: z.string().trim().min(1).max(120), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), position: z.number().finite().min(-1_000_000).max(1_000_000), categoryId: z.string().uuid().nullable(), autostart: z.boolean(), loop: z.boolean(), random: z.boolean(), showNextButton: z.boolean().default(false), gapMs: z.number().int().min(0).max(30_000).default(0), crossfadeMs: z.number().int().min(0).max(30_000).default(0), soundboardBehavior: z.enum(['continue','pause','stop']).default('continue'), items: z.array(z.object({trackId:z.string().uuid(),rowIndex:z.number().int().min(0).max(499)})).min(1).max(500) });
const playlistBaseSchema = playlistSchema.extend({ items: z.array(z.object({trackId:z.string().uuid(),rowIndex:z.number().int().min(0).max(499)})).max(500) });
const referenceSchema = z.object({ tracks: z.array(z.object({id:z.string().uuid(),categoryId:z.string().uuid().nullable(),subcategoryId:z.string().uuid().nullable()})).max(20000), subcategories: z.array(z.object({id:z.string().uuid(),categoryId:z.string().uuid().nullable(),name:z.string(),color:z.string(),position:z.number()})).max(5000), playlists:z.array(z.string().uuid()).max(5000) });

export async function offlineEntityRoutes(app: FastifyInstance) {
  app.post('/api/projects/:id/offline/:kind/:entityId', { bodyLimit: 8 * 1024 * 1024 }, async (request,reply) => {
    const user=await requireUser(request,reply);if(!user)return;
    const {id,kind,entityId}=z.object({id:z.string().uuid(),kind:z.enum(['category','playlist']),entityId:z.string().uuid()}).parse(request.params);
    if(!await canAccessProject(user.id,id))return reply.code(404).send({error:'Projet introuvable.'});
    const account=await accountForUserProject(user.id,id);
    if(kind==='playlist' && (!account || !planFeatures(account.plan).playlists))return reply.code(403).send({error:'Les playlists ne sont pas incluses dans votre forfait.'});
    const input=z.object({actorId:z.string().uuid(),base:z.unknown().nullable(),desired:z.unknown().nullable(),references:referenceSchema.optional()}).parse(request.body);
    if(input.actorId!==user.id)return reply.code(403).send({error:'La session a changé. Les changements restent sur leur appareil d’origine.',reason:'actor-changed'});
    const schema=kind==='category'?categorySchema:playlistSchema;
    const base=input.base===null?null:(kind==='category'?categorySchema:playlistBaseSchema).parse(input.base);
    const desired=input.desired===null?null:schema.parse(input.desired);
    if(!base&&!desired)return reply.code(400).send({error:'Modification vide.'});
    if([base,desired].some((entity)=>entity && (entity.id!==entityId || entity.projectId!==id)))return reply.code(400).send({error:'Cet élément ne correspond pas au spectacle.'});
    const result=await db.transaction(async(tx)=>{
      await tx.execute(sql`select id from projects where id = ${id} for update`);
      let remote:Record<string,unknown>|null=null;
      if(kind==='category'){
        const [row]=await tx.select().from(categories).where(eq(categories.id,entityId)).for('update');
        if(row && row.projectId!==id)return {status:409,body:{error:'Identifiant indisponible.'}};
        remote=row??null;
      }else{
        const [row]=await tx.select().from(playlists).where(eq(playlists.id,entityId)).for('update');
        if(row && row.projectId!==id)return {status:409,body:{error:'Identifiant indisponible.'}};
        if(row){const items=await tx.select({trackId:playlistItems.trackId,rowIndex:playlistItems.rowIndex}).from(playlistItems).where(eq(playlistItems.playlistId,entityId)).orderBy(asc(playlistItems.position));remote={...row,items,trackIds:items.map((item)=>item.trackId)};}
      }
      const [deleted]=await tx.select().from(offlineEntityDeletions).where(and(eq(offlineEntityDeletions.projectId,id),eq(offlineEntityDeletions.kind,kind),eq(offlineEntityDeletions.entityId,entityId)));
      const keys=kind==='category'?categoryKeys:playlistKeys;
      const merged=mergeEntity<Record<string,unknown>>(base,desired,remote,keys);
      let references:z.infer<typeof referenceSchema>|undefined;
      if(kind==='category' && !desired && remote){
        const groups=await tx.select().from(trackSubcategories).where(eq(trackSubcategories.categoryId,entityId)).for('update');
        const members=await tx.select({id:tracks.id,categoryId:tracks.categoryId,subcategoryId:tracks.subcategoryId}).from(tracks).where(or(eq(tracks.categoryId,entityId),...(groups.length?[inArray(tracks.subcategoryId,groups.map((group)=>group.id))]:[])));
        const lists=await tx.select({id:playlists.id}).from(playlists).where(eq(playlists.categoryId,entityId));
        references={tracks:members,subcategories:groups,playlists:lists.map((list)=>list.id)};
        if(!input.references)return {status:400,body:{error:'Références de suppression absentes.'}};
        const changed=members.some((track)=>!input.references!.tracks.some((before)=>before.id===track.id)) || lists.some((list)=>!input.references!.playlists.includes(list.id)) || groups.some((group)=>{const before=input.references!.subcategories.find((item)=>item.id===group.id);return !before || Object.keys(entityChanges(before,group,['name','color','categoryId','position'])).length>0;});
        if(changed)return {status:409,body:{error:'Le contenu de cette catégorie a changé ailleurs. La suppression locale est conservée.',entity:remote,references}};
      }
      if((deleted && desired) || merged.conflict)return {status:409,body:{error:'Cet élément a été modifié ou supprimé ailleurs. Vos changements locaux sont conservés.',entity:remote,...(references?{references}:{})}};
      if(!desired){
        if(kind==='category')await tx.delete(categories).where(and(eq(categories.id,entityId),eq(categories.projectId,id)));
        else await tx.delete(playlists).where(and(eq(playlists.id,entityId),eq(playlists.projectId,id)));
        await tx.insert(offlineEntityDeletions).values({projectId:id,kind,entityId}).onConflictDoNothing();
        return {status:200,body:{entity:null}};
      }
      if(kind==='category'){
        const entity=categorySchema.parse(merged.entity);
        const [saved]=remote?await tx.update(categories).set({name:entity.name,color:entity.color,position:entity.position,backgroundImage:entity.backgroundImage}).where(and(eq(categories.id,entityId),eq(categories.projectId,id))).returning():await tx.insert(categories).values(entity).returning();
        return {status:200,body:{entity:saved}};
      }
      const entity=playlistSchema.parse(merged.entity);
      if(entity.categoryId){const [category]=await tx.select({id:categories.id}).from(categories).where(and(eq(categories.id,entity.categoryId),eq(categories.projectId,id)));if(!category)return {status:400,body:{error:'Catégorie de playlist invalide.'}};}
      const [project]=await tx.select({max:projects.maxPlaylistGroupSize}).from(projects).where(eq(projects.id,id));
      if(!playlistRowsAreValid(entity.items,project?.max??4))return {status:400,body:{error:'Composition des rangées de playlist invalide.'}};
      const available=await tx.select({id:tracks.id}).from(tracks).where(eq(tracks.projectId,id));
      if(entity.items.some((item)=>!available.some((track)=>track.id===item.trackId)))return {status:400,body:{error:'La playlist contient un morceau invalide.'}};
      const {items,...fields}=entity;
      const [saved]=remote?await tx.update(playlists).set({...fields,updatedAt:new Date()}).where(and(eq(playlists.id,entityId),eq(playlists.projectId,id))).returning():await tx.insert(playlists).values(fields).returning();
      await tx.delete(playlistItems).where(eq(playlistItems.playlistId,entityId));
      await tx.insert(playlistItems).values(items.map((item,position)=>({...item,playlistId:entityId,position})));
      return {status:200,body:{entity:{...saved,items,trackIds:items.map((item)=>item.trackId)}}};
    });
    return reply.code(result.status).send(result.body);
  });
}
