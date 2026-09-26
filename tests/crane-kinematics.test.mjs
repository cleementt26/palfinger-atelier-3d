import assert from 'node:assert/strict';
import { test } from 'node:test';
import {GEOMETRY as G,solveLinkage,solvePrimaryLinkage,distance,stageExtensions,sequencePose,isPoseClear,constrainPose,CraneMotion,advanceSpring,nearestRotation} from '../lib/crane-kinematics.ts';

test('both mechanical loops close with rigid links and avoid a hydraulic dead centre',()=>{
  for(const {solve,min,max,r,s,rod,cap} of [
    {solve:solveLinkage,min:-155,max:15,r:G.linkA,s:G.linkB,rod:1.05,cap:1.05},
    {solve:solvePrimaryLinkage,min:0,max:82,r:G.primaryLinkA,s:G.primaryLinkB,rod:1.08,cap:1.59},
  ]){
    let previous=-Infinity;
    for(let i=0;i<=2000;i++){
      const angle=min+(max-min)*i/2000,{p,q,c,length,closureHeight}=solve(angle);
      assert.ok(Math.abs(distance(p,c)-r)<1e-12,'first rigid link length');
      assert.ok(Math.abs(distance(q,c)-s)<1e-12,'second rigid link length');
      assert.ok(closureHeight>.45,'no branch singularity');
      assert.ok(length>previous,'monotonic cylinder stroke');previous=length;
      assert.ok(length-rod>.02 && length-rod<cap-.02,'piston stays inside fixed barrel');
    }
  }
});
test('six stages travel, keep overlap and return exactly to their retract position',()=>{
  assert.deepEqual(stageExtensions(0),[0,0,0,0,0,0]);
  stageExtensions(100).forEach(x=>assert.equal(x,G.stageStroke));
  for(let p=0;p<=100;p+=.1){
    const extension=stageExtensions(p);
    extension.forEach((x,i)=>{
      const parentLength=i===0?G.secondLength:G.stageLength;
      const offset=i===0?G.firstStageOffset:G.nestedStageOffset;
      assert.ok(parentLength-offset-x>=.719999,'minimum overlap');
      const cylinderLength=1.99+x;
      assert.ok(cylinderLength-1.94>.02&&cylinderLength-1.94<1.80,'telescopic piston engagement');
    });
  }
});
test('guided path stays in the demonstration clearance envelope both ways',()=>{
  for(let i=0;i<=4000;i++)assert.ok(isPoseClear(sequencePose(i/40)),`clearance at ${i/40}`);
  const folded=sequencePose(0),extended=sequencePose(100);
  assert.equal(folded.extension,0);assert.equal(extended.extension,100);
  for(let i=0;i<=62;i++)assert.equal(sequencePose(i).extension,0,'no telescope movement before arm positioning');
});
test('manual commands apply the same geometric envelope as the rendered pose',()=>{
  for(const boom of [0,20,45,70,82])for(const knuckle of [-155,-110,-60,-20,0,15])for(const extension of [0,25,50,75,100]){
    const {pose}=constrainPose({boom,knuckle,extension,rotation:900});
    assert.ok(isPoseClear(pose));assert.ok(pose.knuckle>=-155&&pose.knuckle<=15);assert.equal(pose.rotation,900);
  }
});
test('motion clock is invariant at 30, 60 and 120 Hz',()=>{
  const results=[30,60,120].map(fps=>{
    const motion=new CraneMotion(0,0),command={...sequencePose(100),mode:'sequence',deployment:100,rotation:360};
    for(let i=0;i<fps*2;i++)motion.step(command,1/fps,1);
    return motion.pose;
  });
  for(const key of Object.keys(results[0]))assert.ok(Math.max(...results.map(p=>p[key]))-Math.min(...results.map(p=>p[key]))<1e-9,key);
  let spring={value:0,velocity:0};for(let i=0;i<60;i++)spring=advanceSpring(spring,100,1/60);
  const once=advanceSpring({value:0,velocity:0},100,1);
  assert.ok(Math.abs(spring.value-once.value)<1e-10);
});
test('manual to sequence returns without a position jump or a stalled route',()=>{
  const motion=new CraneMotion(100,0),manual={boom:25,knuckle:15,extension:90,rotation:450,mode:'manual',deployment:100};
  for(let i=0;i<600;i++)motion.step(manual,1/60,1);
  const before={...motion.pose},sequence={...manual,mode:'sequence',deployment:58};
  motion.step(sequence,1/60,1);
  for(const key of ['boom','knuckle','extension'])assert.ok(Math.abs(motion.pose[key]-before[key])<1,'no mode switch jump');
  for(let i=0;i<6000;i++){motion.step(sequence,1/60,1);assert.ok(isPoseClear(motion.pose));}
  assert.equal(motion.returning,false);assert.ok(Math.abs(motion.progress-58)<.01);
});
test('slewing remains continuous across whole turns',()=>{
  assert.equal(nearestRotation(359,1),361);assert.equal(nearestRotation(1,359),-1);assert.equal(nearestRotation(719,1),721);
});
test('pause removes residual motion before independent column rotation',()=>{
  const motion=new CraneMotion(58,0),command={...sequencePose(100),mode:'sequence',deployment:100,rotation:0};
  for(let i=0;i<30;i++)motion.step(command,1/60,1);
  motion.hold();const fixed={...motion.pose};command.deployment=motion.progress;command.rotation=270;
  for(let i=0;i<240;i++)motion.step(command,1/60,1);
  for(const key of ['boom','knuckle','extension'])assert.ok(Math.abs(motion.pose[key]-fixed[key])<1e-10);
  assert.ok(motion.pose.rotation>269);
});
