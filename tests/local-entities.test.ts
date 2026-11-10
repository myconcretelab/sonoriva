import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category, ProjectDetail, Track } from '../src/client/types';
import { api } from '../src/client/lib/api';
import { changeRawWorkspace, journalProjectId, listRawWorkspaces, listWorkspaces, mergeWorkspace, readWorkspace } from '../src/client/lib/local-workspace-store';
import { localProject, requireSyncedProject, synchronizeWorkspaces, workspaceSyncStatus } from '../src/client/lib/local-workspace';
import { updateLocalCategory } from '../src/client/lib/local-entities';
import { resolveEntityConflict } from '../src/client/lib/entity-sync';
import { entityKey } from '../src/client/lib/entity-journal';

const userId='11111111-1111-4111-8111-111111111111', projectId='22222222-2222-4222-8222-222222222222';
const category:Category={id:'33333333-3333-4333-8333-333333333333',projectId,name:'Scène',color:'#123456',position:0,backgroundImage:null};
const track={id:'44444444-4444-4444-8444-444444444444',projectId,categoryId:category.id,subcategoryId:null,title:'Ouverture',originalFilename:'son.wav',mimeType:'audio/wav',sizeBytes:4,durationMs:2000,volume:1,loop:false,fadeInMs:0,fadeOutMs:400,startTimeMs:0,endTimeMs:null,videoEndBehavior:'black',backgroundImage:null,tags:[],position:0,createdAt:'2026-11-10T00:00:00.000Z'} as Track;
const detail={project:{id:projectId,maxPlaylistGroupSize:4},categories:[category],tracks:[track],playlists:[],subcategories:[],colors:[]} as unknown as ProjectDetail;
let storage:Map<string,string>, fetcher:ReturnType<typeof vi.fn>;
const input=(ids=[track.id])=>({name:'Enchaînement',color:'#654321',categoryId:category.id,autostart:false,loop:true,random:false,showNextButton:true,gapMs:100,crossfadeMs:500,soundboardBehavior:'continue' as const,items:ids.map((trackId,rowIndex)=>({trackId,rowIndex}))});
beforeEach(async()=>{
 vi.stubGlobal('indexedDB',new IDBFactory());storage=new Map([['sonoriva-user',JSON.stringify({id:userId,isDemo:false})],['sonoriva-account:'+userId,JSON.stringify({accessStatus:'active',features:{playlists:true}})]]);
 vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
 fetcher=vi.fn(async()=>{throw new TypeError('Offline')});vi.stubGlobal('fetch',fetcher);await mergeWorkspace(userId,structuredClone(detail));
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()});
function online(handler:(url:string,init?:RequestInit)=>Promise<Response>){fetcher.mockImplementation(async(url:string,init?:RequestInit)=>url==='/api/auth/me'?Response.json({user:{id:userId}}):handler(url,init));}

describe('organisation enregistrée hors ligne',()=>{
 it('crée, modifie et réordonne des catégories, avec un journal séparé des anciennes interfaces',async()=>{
  const created=await api.createCategory(projectId,'Final','#abcdef');
  await updateLocalCategory(projectId,category.id,{name:'Ouverture',color:'#112233'});
  await api.reorderCategories(projectId,[created.category.id,category.id]);
  expect(fetcher).not.toHaveBeenCalled();
  await changeRawWorkspace(userId,projectId,(record)=>({...record!,detail:structuredClone(detail)}));
  const reopened=await readWorkspace(userId,projectId);
  expect(reopened!.detail.categories.map((item)=>item.name)).toEqual(['Final','Ouverture']);
  expect(await listWorkspaces(userId)).toHaveLength(1);expect(await listRawWorkspaces(userId)).toHaveLength(2);
  expect(journalProjectId(projectId)).not.toBe(projectId);
  await expect(requireSyncedProject(projectId)).rejects.toThrow('changements');
 });
 it('conserve les playlists et leurs options après un rafraîchissement distant',async()=>{
  const saved=await api.savePlaylist(projectId,undefined,input());
  await api.positionPlaylist(projectId,saved.playlist.id,12,null);
  await mergeWorkspace(userId,structuredClone(detail));
  expect((await readWorkspace(userId,projectId))!.detail.playlists[0]).toMatchObject({id:saved.playlist.id,position:12,categoryId:null,crossfadeMs:500,showNextButton:true,loop:true});
  expect((await workspaceSyncStatus(projectId)).entities).toHaveLength(1);
  await expect(api.deleteTrack(track.id)).rejects.toThrow('playlist');
 });
 it('supprime une catégorie et ses groupes sans supprimer les sons ou les playlists',async()=>{
  const group={id:crypto.randomUUID(),projectId,categoryId:category.id,name:'Groupe',color:'#123456',position:0,createdAt:'2026-11-10',updatedAt:'2026-11-10'};
  await mergeWorkspace(userId,{...detail,subcategories:[group],tracks:[{...track,subcategoryId:group.id}]});
  const saved=await api.savePlaylist(projectId,undefined,input());
  await api.updateTrack(track.id,{volume:.16});await api.deleteCategory(projectId,category.id);
  const record=(await readWorkspace(userId,projectId))!;
  expect(record.detail.categories).toEqual([]);expect(record.detail.subcategories).toEqual([]);
  expect(record.detail.tracks[0]).toMatchObject({categoryId:null,subcategoryId:null,volume:.16});
  expect(record.pending[track.id].desired).toMatchObject({categoryId:null,subcategoryId:null});
  expect(record.detail.playlists[0]).toMatchObject({id:saved.playlist.id,categoryId:null});
 });
 it('refuse les opérations hors forfait et annule le journal si le stockage échoue',async()=>{
  storage.set('sonoriva-account:'+userId,JSON.stringify({features:{playlists:false}}));
  await expect(api.savePlaylist(projectId,undefined,input())).rejects.toThrow('forfait');
  const put=IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args){if((args[0] as {journalFor?:string}).journalFor)throw new DOMException('Disque plein','QuotaExceededError');return put.apply(this,args)});
  await expect(api.createCategory(projectId,'Test','#123456')).rejects.toThrow('Disque plein');
  expect((await readWorkspace(userId,projectId))!.detail.categories).toHaveLength(1);
 });
 it('envoie les catégories avant les fichiers, puis les playlists',async()=>{
  const created=(await api.createCategory(projectId,'Locale','#abcdef')).category;
  const form=new FormData();form.set('projectId',projectId);form.set('categoryId',created.id);form.set('title','Import');form.set('file',new Blob(['WAVE'],{type:'audio/wav'}),'nouveau.wav');
  const imported=(await api.uploadTrack(form)).track;
  const saved=await api.savePlaylist(projectId,undefined,{...input([imported.id]),categoryId:created.id});
  const paths:string[]=[];
  online(async(url,init)=>{paths.push(url);if(url==='/api/tracks/upload')return Response.json({track:imported});const body=JSON.parse(String(init!.body));expect(body.actorId).toBe(userId);return Response.json({entity:body.desired})});
  await synchronizeWorkspaces();
  expect(paths).toEqual([`/api/projects/${projectId}/offline/category/${created.id}`,'/api/tracks/upload',`/api/projects/${projectId}/offline/playlist/${saved.playlist.id}`]);
  const record=(await readWorkspace(userId,projectId))!;expect(record.pending).toEqual({});expect(record.entities).toEqual({});
 });
 it('réapplique les changements faits pendant une réponse serveur retardée',async()=>{
  const saved=await api.savePlaylist(projectId,undefined,input());
  let finish!:(value:Response)=>void;
  online(async()=>new Promise<Response>((resolve)=>{finish=resolve}));
  const sending=synchronizeWorkspaces();await vi.waitFor(()=>expect(finish).toBeDefined());
  await api.savePlaylist(projectId,saved.playlist.id,{...input(),name:'Dernier nom'});
  finish(Response.json({entity:saved.playlist}));await sending;
  const record=(await readWorkspace(userId,projectId))!;
  expect(record.detail.playlists[0].name).toBe('Dernier nom');expect(Object.values(record.entities!)[0].base?.name).toBe('Enchaînement');
 });
 it('garde la suppression d’une création en cours et ne la recrée pas après une réponse perdue',async()=>{
  const created=(await api.createCategory(projectId,'Éphémère','#abcdef')).category;
  let finish!:(value:Response)=>void;let first=true;
  online(async(_url,init)=>{const body=JSON.parse(String(init!.body));if(first){first=false;return new Promise<Response>((resolve)=>{finish=resolve})}return Response.json({entity:body.desired})});
  const sending=synchronizeWorkspaces();await vi.waitFor(()=>expect(finish).toBeDefined());
  await api.deleteCategory(projectId,created.id);finish(Response.json({entity:created}));await sending;
  expect((await readWorkspace(userId,projectId))!.detail.categories.some((item)=>item.id===created.id)).toBe(false);
  expect(Object.values((await readWorkspace(userId,projectId))!.entities!).some((item)=>item.desired===null)).toBe(false); // deletion was sent in the final phase
 });
 it('conserve une annulation de réglage pendant un envoi',async()=>{
  await updateLocalCategory(projectId,category.id,{name:'Temporaire'});
  let finish!:(value:Response)=>void;
  online(async()=>new Promise<Response>((resolve)=>{finish=resolve}));
  const sending=synchronizeWorkspaces();await vi.waitFor(()=>expect(finish).toBeDefined());
  await updateLocalCategory(projectId,category.id,{name:category.name});
  finish(Response.json({entity:{...category,name:'Temporaire',color:'#abcdef'}}));await sending;
  const record=(await readWorkspace(userId,projectId))!;
  expect(record.detail.categories[0]).toMatchObject({name:category.name,color:'#abcdef'});
  expect(Object.values(record.entities!)[0]).toMatchObject({base:{name:'Temporaire'},desired:{name:category.name}});
  online(async(_url,init)=>Response.json({entity:JSON.parse(String(init!.body)).desired}));await synchronizeWorkspaces();
  expect((await readWorkspace(userId,projectId))!.entities).toEqual({});
 });
 it('conserve les conflits et permet de garder ou abandonner les changements locaux',async()=>{
  await updateLocalCategory(projectId,category.id,{name:'Local'});
  const remote={...category,name:'Distant',color:'#abcdef'};
  online(async()=>Response.json({error:'Conflit',entity:remote},{status:409}));await synchronizeWorkspaces();
  const key=entityKey('category',category.id);
  expect((await readWorkspace(userId,projectId))!.entities![key].remote).toMatchObject({name:'Distant'});
  await resolveEntityConflict(userId,projectId,key,true);
  expect((await readWorkspace(userId,projectId))!.entities![key].base?.name).toBe('Distant');
  expect((await readWorkspace(userId,projectId))!.detail.categories[0]).toMatchObject({name:'Local',color:'#abcdef'});
  await synchronizeWorkspaces();await resolveEntityConflict(userId,projectId,key,false);
  expect((await readWorkspace(userId,projectId))!.entities).toEqual({});
  expect((await localProject(projectId)).categories[0].name).toBe('Distant');
 });
 it('restaure sous un nouvel identifiant une playlist supprimée ailleurs',async()=>{
  const saved=(await api.savePlaylist(projectId,undefined,input())).playlist;
  online(async(_url,init)=>Response.json({entity:JSON.parse(String(init!.body)).desired}));await synchronizeWorkspaces();
  await api.savePlaylist(projectId,saved.id,{...input(),name:'À conserver'});
  online(async()=>Response.json({error:'Supprimée',entity:null},{status:409}));await synchronizeWorkspaces();
  await resolveEntityConflict(userId,projectId,entityKey('playlist',saved.id),true);
  const restored=(await readWorkspace(userId,projectId))!.detail.playlists[0];
  expect(restored.id).not.toBe(saved.id);expect(restored.name).toBe('À conserver');
  expect((await readWorkspace(userId,projectId))!.detail.playlists).toHaveLength(1);
  expect(Object.values((await readWorkspace(userId,projectId))!.entities!)[0].base).toBeNull();
 });
});
