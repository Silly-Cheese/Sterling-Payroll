import test from "node:test";
import assert from "node:assert/strict";
import {isPendingTimecard, canApproveTimecard, eligibleTimecards, timecardChunks} from "../src/timecard-bulk-core.js";

const entries = [
 {id:"a",status:"pending",createdBy:"somebody"},
 {id:"b",status:"pending",createdBy:"reviewer"},
 {id:"c",status:"approved",createdBy:"somebody"},
 {id:"d",status:"rejected",createdBy:"somebody"},
 {id:"e",createdBy:"somebody"}
];

test("only pending timecards may enter a bulk approval",()=>{
 assert.equal(isPendingTimecard(entries[0]),true);
 assert.equal(isPendingTimecard(entries[2]),false);
 assert.equal(isPendingTimecard(entries[3]),false);
 assert.equal(isPendingTimecard(entries[4]),true);
});

test("ordinary reviewers cannot approve their own entries",()=>{
 assert.deepEqual(eligibleTimecards(entries,"reviewer",{admin:true,owner:false}).map(x=>x.id),["a","e"]);
 assert.equal(canApproveTimecard(entries[0],"reviewer",{admin:false}),false);
 assert.equal(canApproveTimecard(entries[0],"reviewer",{admin:true}),true);
});

test("owner override permits pending self-submitted entries but never completed entries",()=>{
 assert.deepEqual(eligibleTimecards(entries,"reviewer",{admin:true,owner:true}).map(x=>x.id),["a","b","e"]);
 assert.equal(canApproveTimecard(entries[2],"reviewer",{admin:true,owner:true}),false);
 assert.equal(canApproveTimecard(entries[3],"reviewer",{admin:true,owner:true}),false);
});

test("grouping respects safe transaction size",()=>{
 assert.deepEqual(timecardChunks([1,2,3,4,5],2),[[1,2],[3,4],[5]]);
 assert.throws(()=>timecardChunks([1],0));
 assert.throws(()=>timecardChunks([1],101));
});
