import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDeviceReport} from '../src/device-report.js';
const hit=id=>({allergen_id:id});
test('even a user-confirmed capture with all reference words cannot certify hardware or accuracy',()=>{
 const r=buildDeviceReport({referenceId:'en_positive',physicalConfirmed:true,dimensions:{width:4032,height:3024},camera:{route:'image_capture',preview_width:640,preview_height:480},product:{direct_matches:['milk','wheat','egg'].map(hit),sources:[{items:[{text:'words'}]}]}});
 assert.equal(r.physical_capture_confirmed_by_user,true);assert.equal(r.physical_hardware_verified,false);assert.equal(r.accuracy_validated,false);assert.equal(r.food_safety_certified,false);
 assert.equal(r.physical_test_status,'user_run_capture_pending_human_review');assert.deepEqual(r.analysis.missing_known_allergens,[]);assert.equal(r.capture.width,4032);assert.equal(r.capture.preview_width,640);
});
test('a failed read keeps known misses, and a negative card is not a food safety result',()=>{
 const failed=buildDeviceReport({referenceId:'en_positive',error:true});assert.equal(failed.analysis.state,'failed');assert.equal(failed.analysis.missing_known_allergens.length,3);
 const blank=buildDeviceReport({referenceId:'ko_positive',dimensions:{width:100,height:100}});assert.equal(blank.analysis.state,'no_text_read');assert.equal(blank.analysis.missing_known_allergens.length,3);
 const negative=buildDeviceReport({referenceId:'en_negative',product:{direct_matches:[hit('milk')],status:'safe'}});assert.deepEqual(negative.analysis.additional_warnings_in_card_reference,['milk']);assert.equal(negative.analysis.unexpected_safe_output,true);assert.equal(negative.food_safety_certified,false);
});
test('export is an explicit allowlist and omits source text, photos, filenames and unique camera ids',()=>{
 const r=buildDeviceReport({referenceId:'ko_positive',camera:{deviceId:'private-device',groupId:'private-group',label:'private-label'},product:{sources:[{items:[{text:'private-transcript'}]}],original_filename:'private-filename',photo:'private-image'},quality:{issues:['possible_blur','private-quality']}});
 const text=JSON.stringify(r);for(const secret of ['private-device','private-group','private-label','private-transcript','private-filename','private-image','private-quality'])assert.ok(!text.includes(secret));
 assert.equal(r.privacy.automatic_upload,false);assert.throws(()=>buildDeviceReport({referenceId:'__proto__'}),/Unknown/);
});
