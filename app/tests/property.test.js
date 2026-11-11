import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProperty,priceText,statusText,propertySlug} from '../src/property.js';
import {handleContact} from '../src/contact.js';
const property={title:'Piso en Madrid',slug:'piso-madrid',operation:'rent',availability:'available',location:'Madrid',price_eur:'1500',area_m2:'84.5',bedrooms:'2',bathrooms:'1',description:'Luminoso.',published:true};
test('validates property data and preserves optional fields',()=>{
 const p=validateProperty(property);assert.equal(p.price_eur,1500);assert.equal(p.area_m2,84.5);assert.equal(p.published,1);assert.match(priceText(p),/mes/);assert.equal(statusText(p),'Alquiler');assert.equal(validateProperty({...property,price_eur:''}).price_eur,null);
});
test('rejects invalid property data',()=>{
 for(const p of [{...property,title:''},{...property,slug:'bad/slug'},{...property,price_eur:'-1'},{...property,area_m2:'0'},{...property,bedrooms:'1.2'},{...property,availability:'unknown'}])assert.throws(()=>validateProperty(p));
});
test('generates readable property slugs and handles accents or symbol-only titles',()=>{
 assert.equal(propertySlug('Ático en La Coruña'), 'atico-en-la-coruna');
 assert.equal(propertySlug('!!!'), 'inmueble');
 assert.ok(propertySlug('á'.repeat(180)).length <= 170);
});
test('property enquiry includes the verified listing in delivery',async()=>{
 const body={name:'Persona',email:'hello@example.com',message:'Quiero saber más sobre este inmueble.',consent:true,propertySlug:'piso-madrid'};
 const req=new Request('https://ght.example/api/contact',{method:'POST',headers:{Origin:'https://ght.example','Content-Type':'application/json'},body:JSON.stringify(body)});
 const env={RESEND_API_KEY:'test',CONTACT_FROM_EMAIL:'from@example.com',CONTACT_TO_EMAIL:'to@example.com',DB:{prepare:()=>({bind:()=>({first:async()=>({title:'Piso en Madrid',slug:'piso-madrid'})})})}};
 let sent;const response=await handleContact(req,env,async(_url,opts)=>{sent=JSON.parse(opts.body);return new Response('{}',{status:200});});assert.equal(response.status,200);assert.match(sent.text,/Inmueble: Piso en Madrid \(piso-madrid\)/);
});
