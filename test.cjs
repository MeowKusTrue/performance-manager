const {test} = require('node:test');
const assert = require('node:assert/strict');
const {domains,matches,eligible,memoryBytes} = require('./performance-manager.uc.js');
const now = 1800000000000;
const opts = {minutes:15, exclusions:domains('mail.google.com, reduxhub.ru'), allowOnly:true, allowed:domains('youtube.com')};
function tab(props={},browser={},attrs=[]) {return {lastAccessed:now-20*60000,linkedBrowser:{isConnected:true,isRemoteBrowser:true,currentURI:{scheme:'https',asciiHost:'www.youtube.com'},...browser},hasAttribute:a=>attrs.includes(a),...props};}
const safe = ()=>true;
test('domain boundary and case',()=>{assert(matches('WWW.YouTube.com',domains('youtube.com'))); assert(!matches('notyoutube.com',domains('youtube.com'))); assert(!matches('youtube.com.bad.test',domains('youtube.com')));});
test('idle allowlisted tab',()=>assert(eligible(tab(),opts,now,safe)));
test('protected tab states',()=>{for(const k of ['selected','pinned','closing','hidden','multiselected','undiscardable','soundPlaying','pictureinpicture']) assert(!eligible(tab({[k]:true}),opts,now,safe),k); for(const a of ['pending','discarded','busy','sharing','soundplaying','soundplaying-scheduledremoval','pictureinpicture','activemedia-blocked','undiscardable']) assert(!eligible(tab({}, {}, [a]),opts,now,safe),a);});
test('recent and invalid timestamps',()=>{for(const t of [now-10000,undefined,0,now+1]) assert(!eligible(tab({lastAccessed:t}),opts,now,safe));});
test('exclude and allowlist',()=>{const other=tab({}, {currentURI:{scheme:'https',asciiHost:'example.com'}});assert(!eligible(other,opts,now,safe)); assert(eligible(other,{...opts,allowOnly:false},now,safe)); assert(!eligible(tab({}, {currentURI:{scheme:'https',asciiHost:'mail.google.com'}}),{...opts,allowOnly:false},now,safe));});
test('browser and safety guard',()=>{assert(!eligible(tab(),opts,now,()=>false));assert(!eligible(tab(),opts,now,()=>{throw Error()}));assert(!eligible(tab({}, {isRemoteBrowser:false}),opts,now,safe));assert(!eligible(tab({}, {webProgress:{isLoadingDocument:true}}),opts,now,safe));assert(!eligible(tab({}, {currentURI:{scheme:'about',asciiHost:'youtube.com'}}),opts,now,safe));});
test('sum distinct process ids',()=>assert.equal(memoryBytes({pid:1,memory:100,children:[{pid:2,memory:200},{pid:2,memory:200},{pid:3,memory:300}]}),600));
test('missing memory is not zero',()=>assert.equal(memoryBytes({pid:1}),null));
