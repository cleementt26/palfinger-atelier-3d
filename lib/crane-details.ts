import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Public photographs establish the construction vocabulary, not these dimensions.
 * All dimensions here are visual reconstruction units. Joint centres and strokes
 * remain entirely owned by crane-kinematics.ts. */
export function chamferedSection(height:number,width:number,chamfer:number) {
  const h=height/2,w=width/2,c=Math.min(chamfer,h*.45,w*.45);
  return [[-h+c,-w],[h-c,-w],[h,-w+c],[h,w-c],[h-c,w],[-h+c,w],[-h,w-c],[-h,-w+c]];
}

/** A tapered, eight-face welded box boom. Optional inner skin leaves the mouth open. */
export function boxSection(length:number,heightA:number,widthA:number,heightB:number,widthB:number,wall=0) {
  const positions:number[]=[],normals:number[]=[],uvs:number[]=[];
  const ring=(x:number,h:number,w:number)=>chamferedSection(h,w,Math.min(h,w)*.16).map(([y,z])=>new THREE.Vector3(x,y,z));
  const a=ring(0,heightA,widthA),b=ring(length,heightB,widthB);
  const normal=new THREE.Vector3(),edge=new THREE.Vector3(),edge2=new THREE.Vector3();
  function triangle(p:THREE.Vector3,q:THREE.Vector3,r:THREE.Vector3) {
    edge.subVectors(q,p);edge2.subVectors(r,p);normal.crossVectors(edge,edge2).normalize();
    [p,q,r].forEach((v,i)=>{positions.push(v.x,v.y,v.z);normals.push(normal.x,normal.y,normal.z);uvs.push(i===0?0:1,i===2?1:0);});
  }
  function quad(p:THREE.Vector3,q:THREE.Vector3,r:THREE.Vector3,s:THREE.Vector3) {triangle(p,q,r);triangle(p,r,s);}
  for(let i=0;i<8;i++){const j=(i+1)%8;quad(a[i],a[j],b[j],b[i]);}
  if(wall>0) {
    const ia=ring(0,heightA-2*wall,widthA-2*wall),ib=ring(length,heightB-2*wall,widthB-2*wall);
    for(let i=0;i<8;i++){const j=(i+1)%8;quad(ia[i],ib[i],ib[j],ia[j]);quad(a[i],ia[i],ia[j],a[j]);quad(b[i],b[j],ib[j],ib[i]);}
  } else {
    const ca=new THREE.Vector3(),cb=new THREE.Vector3(length,0,0);
    for(let i=0;i<8;i++){const j=(i+1)%8;triangle(ca,a[j],a[i]);triangle(cb,b[i],b[j]);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));return geometry;
}

/** Profiled side plate, with actual pin bores instead of painted circular marks. */
export function profilePlate(points:number[][],thickness:number,holes:{x:number;y:number;r:number}[]=[],simple=false) {
  const shape=new THREE.Shape();points.forEach(([x,y],i)=>i===0?shape.moveTo(x,y):shape.lineTo(x,y));shape.closePath();
  holes.forEach(({x,y,r})=>{const hole=new THREE.Path();hole.absarc(x,y,r,0,Math.PI*2,true);shape.holes.push(hole);});
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,steps:1,bevelEnabled:!simple,bevelThickness:.009,bevelSize:.009,bevelSegments:1,curveSegments:simple?4:8});geometry.translate(0,0,-thickness/2);return geometry;
}

/** Static mesh batching is scoped to each rigid parent and selectable material.
 * It never combines articulated parents or the moving pin meshes. */
export function batchRigidMeshes(root:THREE.Group) {
  const parents:THREE.Object3D[]=[];root.traverse(o=>{if(o.children.length&&!o.userData.noBatch)parents.push(o);});let removed=0;
  for(const parent of parents) {
    if(parent.userData.noBatch)continue;
    const buckets=new Map<THREE.Material,THREE.Mesh[]>();
    for(const child of [...parent.children]) {
      if(!(child instanceof THREE.Mesh)||Array.isArray(child.material)||child.userData.dynamic||child.userData.noBatch||!child.userData.part)continue;
      const bucket=buckets.get(child.material)??[];bucket.push(child);buckets.set(child.material,bucket);
    }
    for(const [material,meshes] of buckets) {
      if(meshes.length<2)continue;
      const prepared=meshes.map(mesh=>{mesh.updateMatrix();const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();geometry.applyMatrix4(mesh.matrix);geometry.deleteAttribute("uv");return geometry;});
      const combined=mergeGeometries(prepared,false);prepared.forEach(g=>g.dispose());if(!combined)continue;
      const merged=new THREE.Mesh(combined,material);merged.userData.part=meshes[0].userData.part;merged.name=`${parent.name||"assembly"} · ${merged.userData.part}`;merged.castShadow=true;merged.receiveShadow=true;parent.add(merged);meshes.forEach(m=>parent.remove(m));removed+=meshes.length-1;
    }
  }
  return removed;
}

/** Fixed-size tube buffers follow four moving anchors. No geometry or curve is
 * reconstructed during animation; only the existing vertex buffers are updated. */
export function flexibleHose(segments=20,sides=6,radius=.023) {
  const geometry=new THREE.BufferGeometry(),positions=new Float32Array((segments+1)*(sides+1)*3),normals=new Float32Array(positions.length),indices:number[]=[];
  for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,b,a+1,b,b+1,a+1);}
  geometry.setAttribute("position",new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute("normal",new THREE.BufferAttribute(normals,3).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(indices);
  const center=new THREE.Vector3(),tangent=new THREE.Vector3(),side=new THREE.Vector3(),up=new THREE.Vector3(),rim=new THREE.Vector3(),fallback=new THREE.Vector3(1,0,0);
  const update=(points:THREE.Vector3[],planeNormal:THREE.Vector3)=>{
    for(let i=0;i<=segments;i++) {
      const t=i/segments,s=1-t;center.set(0,0,0).addScaledVector(points[0],s*s*s).addScaledVector(points[1],3*s*s*t).addScaledVector(points[2],3*s*t*t).addScaledVector(points[3],t*t*t);
      tangent.set(0,0,0).addScaledVector(points[0],-3*s*s).addScaledVector(points[1],3*s*s-6*s*t).addScaledVector(points[2],6*s*t-3*t*t).addScaledVector(points[3],3*t*t).normalize();
      side.crossVectors(tangent,planeNormal);if(side.lengthSq()<1e-8)side.crossVectors(tangent,fallback);side.normalize();up.crossVectors(side,tangent).normalize();
      for(let j=0;j<=sides;j++){const angle=j/sides*Math.PI*2,k=(i*(sides+1)+j)*3;rim.copy(side).multiplyScalar(Math.cos(angle)).addScaledVector(up,Math.sin(angle));positions[k]=center.x+radius*rim.x;positions[k+1]=center.y+radius*rim.y;positions[k+2]=center.z+radius*rim.z;normals[k]=rim.x;normals[k+1]=rim.y;normals[k+2]=rim.z;}
    }
    geometry.getAttribute("position").needsUpdate=true;geometry.getAttribute("normal").needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();
  };
  return {geometry,update};
}
