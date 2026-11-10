import {test} from 'node:test';
import assert from 'node:assert/strict';
import {imageMarkup,galleryImage} from '../src/image-variants.js';

test('responsive gallery image uses sized variants and keeps original available',()=>{
 const image={object_key:'original',alt:'Patio',variants:[{width:960,height:640,object_key:'large'},{width:480,height:320,object_key:'small'}]};
 const html=galleryImage(image,0);
 assert.match(html,/href="\/media\/original"/);assert.match(html,/srcset="\/media\/small 480w, \/media\/large 960w"/);assert.match(html,/width="960" height="640"/);assert.match(html,/fetchpriority="high"/);assert.match(html,/alt="Patio"/);
});
test('old gallery images retain desktop original and mobile thumbnail',()=>{
 const html=imageMarkup({object_key:'original',thumbnail_key:'legacy',alt:''},{gallery:true});
 assert.match(html,/source media="\(max-width: 700px\)" srcset="\/media\/legacy"/);assert.match(html,/src="\/media\/original"/);
});
