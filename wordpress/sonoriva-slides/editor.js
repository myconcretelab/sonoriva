(function (wp) {
    'use strict';
    const el = wp.element.createElement;
    const {registerBlockType, createBlock} = wp.blocks;
    const {useBlockProps, InnerBlocks, InspectorControls, MediaUpload, MediaUploadCheck, RichText} = wp.blockEditor;
    const {PanelBody, SelectControl, TextControl, TextareaControl, Button} = wp.components;
    const cleanText = value => { const doc = new DOMParser().parseFromString(value || '', 'text/html'); return doc.body.textContent || ''; };
    const mediaAttrs = media => ({id: media.id, url: media.url, alt: media.alt || '', caption: cleanText(media.caption)});
    const attrs = {ratio:{type:'string',default:'4/3'},fit:{type:'string',default:'contain'},label:{type:'string',default:'Diaporama'},transition:{type:'string',default:'fade'},duration:{type:'number',default:450}};
    registerBlockType('sonoriva/slider', {
        apiVersion:3, title:'Diaporama SonoRiva', category:'media', icon:'images-alt2', keywords:['slider','carousel','galerie'], attributes:attrs, supports:{align:['wide','full'],html:false},
        edit: function (props) {
            const a = props.attributes;
            const blocks = wp.data.useSelect(select => select('core/block-editor').getBlocks(props.clientId), [props.clientId]);
            const {insertBlocks} = wp.data.useDispatch('core/block-editor');
            return el('div',useBlockProps({className:'sr-slides sr-slides-edit',style:{'--sr-ratio':a.ratio,'--sr-fit':a.fit}}),
                el(InspectorControls,null,el(PanelBody,{title:'Réglages du diaporama'},
                    el(SelectControl,{label:'Effet de transition',value:a.transition,options:[{label:'Fondu',value:'fade'},{label:'Glissement horizontal',value:'slide'},{label:'Glissement vertical',value:'vertical'},{label:'Zoom doux',value:'zoom'},{label:'Sans animation',value:'none'}],onChange:transition=>props.setAttributes({transition})}),
                    el(SelectControl,{label:'Vitesse de transition',value:String(a.duration),options:[{label:'Rapide · 250 ms',value:'250'},{label:'Normale · 450 ms',value:'450'},{label:'Douce · 700 ms',value:'700'}],onChange:duration=>props.setAttributes({duration:Number(duration)})}),
                    el(TextControl,{label:'Nom accessible',value:a.label,onChange:label=>props.setAttributes({label})}),
                    el(SelectControl,{label:'Format des images',value:a.ratio,options:[{label:'Paysage 4:3',value:'4/3'},{label:'Large 16:9',value:'16/9'},{label:'Carré',value:'1/1'},{label:'Portrait 3:4',value:'3/4'}],onChange:ratio=>props.setAttributes({ratio})}),
                    el(SelectControl,{label:'Cadrage',help:'« Image entière » préserve tous les détails des captures d’écran.',value:a.fit,options:[{label:'Image entière',value:'contain'},{label:'Remplir le cadre',value:'cover'}],onChange:fit=>props.setAttributes({fit})})
                )),
                el('p',{className:'sr-editor-label'},'Diaporama SonoRiva · '+blocks.length+' image(s)'),
                el(InnerBlocks,{allowedBlocks:['sonoriva/slide'],renderAppender:InnerBlocks.ButtonBlockAppender}),
                el(MediaUploadCheck,null,el(MediaUpload,{allowedTypes:['image'],multiple:true,gallery:true,onSelect:media=>insertBlocks((Array.isArray(media)?media:[media]).map(m=>createBlock('sonoriva/slide',mediaAttrs(m))),blocks.length,props.clientId),render:({open})=>el(Button,{variant:'secondary',onClick:open},'Ajouter des images')})),
                el('p',{className:'sr-editor-help'},'Sélectionnez une diapositive pour modifier son image, sa légende ou son texte superposé. Utilisez les flèches de déplacement du bloc pour changer l’ordre.')
            );
        },
        save: function ({attributes:a}) {
            return el('section',useBlockProps.save({className:'sr-slides','aria-label':a.label,style:{'--sr-ratio':a.ratio,'--sr-fit':a.fit}}),el('div',{className:'sr-slides-track'},el(InnerBlocks.Content)));
        }
    });
    registerBlockType('sonoriva/slide', {
        apiVersion:3,title:'Diapositive SonoRiva',category:'media',icon:'format-image',parent:['sonoriva/slider'],supports:{html:false,reusable:false},
        attributes:{id:{type:'number'},url:{type:'string',default:''},alt:{type:'string',default:''},caption:{type:'string',default:''},overlay:{type:'string',default:''}},
        edit:function (props) {
            const a = props.attributes;
            return el('figure',useBlockProps({className:'sr-slide'}),
                el(InspectorControls,null,el(PanelBody,{title:'Contenu de la diapositive'},
                    el(TextareaControl,{label:'Description de l’image (texte alternatif)',value:a.alt,onChange:alt=>props.setAttributes({alt})}),
                    el(TextareaControl,{label:'Texte sur la photo (facultatif)',help:'Le texte apparaît en bas sur un dégradé sombre.',value:a.overlay,onChange:overlay=>props.setAttributes({overlay})})
                )),
                el('div',{className:'sr-slide-media'},a.url?el('img',{src:a.url,alt:a.alt}):el('p',null,'Choisissez une image'),a.overlay?el('div',{className:'sr-slide-overlay'},a.overlay):null),
                el(MediaUploadCheck,null,el(MediaUpload,{allowedTypes:['image'],value:a.id,onSelect:m=>props.setAttributes({...mediaAttrs(m),caption:a.caption||cleanText(m.caption)}),render:({open})=>el(Button,{variant:'secondary',onClick:open},a.url?'Remplacer l’image':'Choisir une image')})),
                el(RichText,{tagName:'figcaption',className:'sr-slide-caption',value:a.caption,placeholder:'Ajouter une légende…',allowedFormats:['core/bold','core/italic'],onChange:caption=>props.setAttributes({caption})})
            );
        },
        save:function ({attributes:a}) {
            return el('figure',useBlockProps.save({className:'sr-slide'}),
                el('div',{className:'sr-slide-media'},a.url?el('img',{src:a.url,alt:a.alt,loading:'lazy',decoding:'async',className:a.id?'wp-image-'+a.id:undefined}):null,a.overlay?el('div',{className:'sr-slide-overlay'},a.overlay):null),
                a.caption?el(RichText.Content,{tagName:'figcaption',className:'sr-slide-caption',value:a.caption}):null
            );
        }
    });
})(window.wp);
