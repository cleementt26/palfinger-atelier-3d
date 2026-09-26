"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { SVGRenderer } from "three/examples/jsm/renderers/SVGRenderer.js";
import { createCrane } from "@/lib/crane-model";
import { PARTS, type CranePose, type PartId } from "@/lib/crane-data";
import {CraneMotion,measurements,type JointPose} from "@/lib/crane-kinematics";
import { LoaderCircle, RotateCcw } from "lucide-react";

export type ViewName="perspective"|"side"|"top"|"joint";
export type ViewerHandle={view:(name:ViewName)=>void;zoom:(direction:1|-1)=>void;clearTrail:()=>void};
export type Telemetry={pose:JointPose;progress:number;limited:boolean;returning:boolean;measurements:ReturnType<typeof measurements>};
type Props={pose:CranePose;selected:PartId|null;labels:boolean;autoRotate:boolean;mechanism:boolean;trace:boolean;playing:boolean;paused:boolean;direction:1|-1;speed:number;onSelect:(id:PartId)=>void;onReady:()=>void;onTelemetry:(value:Telemetry)=>void;onPlaybackEnd:(progress:number)=>void};

const Viewer=forwardRef<ViewerHandle,Props>(function Viewer(props,ref){
  const container=useRef<HTMLDivElement>(null);
  const buttons=useRef<Record<string,HTMLButtonElement|null>>({});
  const current=useRef(props);current.current=props;
  const api=useRef<ViewerHandle>({view:()=>{},zoom:()=>{},clearTrail:()=>{}});
  const [ready,setReady]=useState(false),[failure,setFailure]=useState(false),[retry,setRetry]=useState(0),[compatible,setCompatible]=useState(false);
  useImperativeHandle(ref,()=>({view:n=>api.current.view(n),zoom:n=>api.current.zoom(n),clearTrail:()=>api.current.clearTrail()}),[]);

  useEffect(()=>{
    const host=container.current;if(!host)return;
    let alive=true,raf=0,renderer:THREE.WebGLRenderer|SVGRenderer|undefined;
    let cleanup=()=>{};
    setFailure(false);setReady(false);
    try {
      let gpu:THREE.WebGLRenderer|undefined;
      try {gpu=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"default"});renderer=gpu;} catch {renderer=new SVGRenderer();renderer.setQuality("low");renderer.setPrecision(2);}
      const software=!gpu;setCompatible(software);
      if(gpu){gpu.setPixelRatio(Math.min(window.devicePixelRatio,1.75));gpu.setClearColor(0xe9edef,1);gpu.outputColorSpace=THREE.SRGBColorSpace;gpu.toneMapping=THREE.ACESFilmicToneMapping;gpu.toneMappingExposure=1.3;gpu.shadowMap.enabled=true;gpu.shadowMap.type=THREE.PCFSoftShadowMap;gpu.shadowMap.autoUpdate=false;}
      else (renderer as SVGRenderer).setClearColor(new THREE.Color(0xe9edef),1);
      const canvas=renderer.domElement;canvas.setAttribute("tabindex","0");canvas.setAttribute("aria-label","Grue Palfinger en 3D. Glissez pour tourner et utilisez les boutons pour changer de vue ou zoomer.");
      host.insertBefore(canvas,host.firstChild);
      const scene=new THREE.Scene();scene.background=new THREE.Color(0xe9edef);
      const camera=new THREE.OrthographicCamera(-10,10,8,-8,.1,150);
      camera.position.set(13,10,17);
      const controls=new OrbitControls(camera,canvas as HTMLElement);controls.enableDamping=true;controls.dampingFactor=.09;controls.enablePan=true;
      controls.minPolarAngle=.04;controls.maxPolarAngle=Math.PI/2-.04;controls.minZoom=.35;controls.maxZoom=4;controls.autoRotateSpeed=.7;
      controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
      controls.listenToKeyEvents(canvas as HTMLElement);
      let environment:THREE.WebGLRenderTarget|undefined;
      if(gpu){const room=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(gpu);environment=pmrem.fromScene(room,.05);scene.environment=environment.texture;room.dispose();pmrem.dispose();}
      scene.add(new THREE.HemisphereLight(0xf8fbff,0x667681,2.1));if(software)scene.add(new THREE.AmbientLight(0xffffff,.52));
      const key=new THREE.DirectionalLight(0xfffaf0,software?.6:3.8);key.position.set(-5,15,7);key.castShadow=true;key.shadow.mapSize.set(2048,2048);
      Object.assign(key.shadow.camera,{left:-18,right:18,top:15,bottom:-15,near:1,far:50});key.shadow.bias=-.0003;key.shadow.normalBias=.035;key.shadow.radius=3;scene.add(key);
      const rim=new THREE.DirectionalLight(0xc9d9ff,software?.18:1.5);rim.position.set(7,8,-7);scene.add(rim);
      const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xe9edef,roughness:1,metalness:0}));floor.rotation.x=-Math.PI/2;floor.position.y=-.1;floor.receiveShadow=true;if(gpu)scene.add(floor);
      const grid=new THREE.GridHelper(software?40:80,software?40:80,0xc9d0d4,0xd7dde0);grid.position.y=-.085;(grid.material as THREE.Material).transparent=true;(grid.material as THREE.Material).opacity=software?.22:.4;(grid.material as THREE.LineBasicMaterial).color.setHex(0xbac5cc);scene.add(grid);
      const ring=new THREE.Mesh(new THREE.RingGeometry(4.32,4.345,128),new THREE.MeshBasicMaterial({color:0xb3bdc2,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=-.078;scene.add(ring);
      const crane=createCrane(software);scene.add(crane.root);
      let autoFit=true,visible=true,closeup=false,needsRender=true;let lastPart:PartId|null=null,lastMechanism=false;
      const motion=new CraneMotion(current.current.pose.deployment,current.current.pose.rotation);let width=1,height=1;
      let previousPose="",wasPlaying=false,playProgress=motion.progress,lastTelemetry=0,previousTelemetry="";
      const trailPoints:THREE.Vector3[]=[];
      const trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute("position",new THREE.BufferAttribute(new Float32Array(600),3));trailGeometry.setDrawRange(0,0);
      const trail=new THREE.Line(trailGeometry,new THREE.LineBasicMaterial({color:0xbe8200,transparent:true,opacity:.7}));trail.frustumCulled=false;scene.add(trail);
      const clearTrail=()=>{trailPoints.length=0;trailGeometry.setDrawRange(0,0);needsRender=true;};
      function fit(){
        if(closeup){const target=current.current.selected==="main"?crane.markers.main.getWorldPosition(new THREE.Vector3()):crane.focus();const delta=target.clone().sub(controls.target);controls.target.copy(target);camera.position.add(delta);const aspect=width/height,half=Math.max(2.15,2.8/aspect);camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();return;}
        const bounds=new THREE.Box3().setFromObject(crane.root);const center=bounds.getCenter(new THREE.Vector3());
        const direction=camera.position.clone().sub(controls.target).normalize();
        controls.target.copy(center);camera.position.copy(center.clone().addScaledVector(direction,30));camera.lookAt(center);camera.updateMatrixWorld();
        let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
        crane.root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();const b=o.geometry.boundingBox!;
          for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const p=new THREE.Vector3(x,y,z).applyMatrix4(o.matrixWorld).applyMatrix4(camera.matrixWorldInverse);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
        });
        const shift=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar((minX+maxX)/2).add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1).multiplyScalar((minY+maxY)/2));
        camera.position.add(shift);controls.target.add(shift);
        const aspect=width/height;const half=Math.max((maxY-minY)/2,(maxX-minX)/(2*aspect))*1.22;
        camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
      }
      function resize(){const rect=host!.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);if(gpu)gpu.setSize(width,height,false);else (renderer as SVGRenderer).setSize(width,height);fit();needsRender=true;}
      const observer=new ResizeObserver(resize);observer.observe(host);resize();
      const visibility=new IntersectionObserver(e=>visible=e[0].isIntersecting,{rootMargin:"100px"});visibility.observe(host);
      controls.addEventListener("start",()=>{autoFit=false;closeup=false;});
      api.current={
        view(name){autoFit=true;closeup=name==="joint";camera.zoom=1;const direction=name==="joint"?new THREE.Vector3(0,1,25).applyAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(motion.pose.rotation)):name==="side"?new THREE.Vector3(0,1,25):name==="top"?new THREE.Vector3(.001,30,.05):new THREE.Vector3(13,9,18);
          camera.position.copy(controls.target.clone().add(direction));fit();controls.update();needsRender=true;},
        zoom(direction){autoFit=false;camera.zoom=THREE.MathUtils.clamp(camera.zoom*(direction===1?1.2:1/1.2),.35,4);camera.updateProjectionMatrix();needsRender=true;},
        clearTrail,
      };
      const ray=new THREE.Raycaster();const pointer=new THREE.Vector2();let down:[number,number]=[0,0];
      const pointerDown=(event:Event)=>{const e=event as PointerEvent;down=[e.clientX,e.clientY];};
      const pointerUp=(event:Event)=>{const e=event as PointerEvent;if(Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)return;const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObject(crane.root,true).find(o=>o.object.userData.part);if(hit)current.current.onSelect(hit.object.userData.part);};
      const contextLost=(e:Event)=>{e.preventDefault();setFailure(true);};
      canvas.addEventListener("pointerdown",pointerDown);canvas.addEventListener("pointerup",pointerUp);canvas.addEventListener("webglcontextlost",contextLost);
      const v=new THREE.Vector3();
      let lastRender=0,previousTime=0;
      function frame(time=0){
        if(!alive)return;raf=requestAnimationFrame(frame);const dt=previousTime?Math.min((time-previousTime)/1000,.1):0;previousTime=time;if(!visible||document.hidden)return;
        const p=current.current;
        if(p.playing&&!wasPlaying)playProgress=motion.progress;wasPlaying=p.playing;
        if(!p.paused){
          if(p.playing&&!motion.returning)playProgress=THREE.MathUtils.clamp(playProgress+p.direction*dt*p.speed*4,0,100);
          motion.step(p.playing?{...p.pose,deployment:playProgress}:p.pose,dt,p.speed);
        }else motion.hold();
        if(p.playing&&!motion.returning&&Math.abs(motion.progress-(p.direction===1?100:0))<.005){wasPlaying=false;current.current.onPlaybackEnd(p.direction===1?100:0);}
        const telemetryKey=[...Object.values(motion.pose).map(x=>x.toFixed(2)),motion.progress.toFixed(2),motion.limited,motion.returning].join("/");
        if(time-lastTelemetry>100&&telemetryKey!==previousTelemetry){lastTelemetry=time;previousTelemetry=telemetryKey;current.current.onTelemetry({pose:{...motion.pose},progress:motion.progress,limited:motion.limited,returning:motion.returning,measurements:measurements(motion.pose)});}
        // Integrate at the animation clock rate, independently of the SVG draw rate.
        if(software&&time-lastRender<65)return;lastRender=time;
        const poseKey=Object.values(motion.pose).map(x=>x.toFixed(4)).join("/");
        if(poseKey!==previousPose){
          crane.setPose(motion.pose);previousPose=poseKey;needsRender=true;if(gpu)gpu.shadowMap.needsUpdate=true;if(autoFit)fit();
          if(p.trace){const tip=crane.tip();if(!trailPoints.length||tip.distanceTo(trailPoints.at(-1)!)>.035){trailPoints.push(tip);if(trailPoints.length>200)trailPoints.shift();const attr=trailGeometry.getAttribute("position");trailPoints.forEach((point,i)=>attr.setXYZ(i,point.x,point.y,point.z));attr.needsUpdate=true;trailGeometry.setDrawRange(0,trailPoints.length);}}
        }
        if(!p.trace&&trailPoints.length)clearTrail();trail.visible=p.trace;
        if(lastMechanism!==p.mechanism){crane.showMechanism(p.mechanism);lastMechanism=p.mechanism;needsRender=true;if(gpu)gpu.shadowMap.needsUpdate=true;}
        if(p.selected!==lastPart){crane.select(p.selected);lastPart=p.selected;needsRender=true;}
        controls.autoRotate=p.autoRotate;const cameraMoved=controls.update(software?.065:Math.max(dt,.001));
        for(const part of PARTS){const b=buttons.current[part.id];if(!b)continue;crane.markers[part.id].getWorldPosition(v);v.project(camera);const x=(v.x*.5+.5)*width,y=(-v.y*.5+.5)*height;
          b.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%)`;b.style.visibility=p.labels&&v.z<1&&x>15&&x<width-15&&y>45&&y<height-45?"visible":"hidden";
        }
        if(needsRender||cameraMoved){renderer!.render(scene,camera);needsRender=false;}
      }
      frame();setReady(true);current.current.onReady();
      cleanup=()=>{observer.disconnect();visibility.disconnect();canvas.removeEventListener("pointerdown",pointerDown);canvas.removeEventListener("pointerup",pointerUp);canvas.removeEventListener("webglcontextlost",contextLost);controls.dispose();crane.dispose();trailGeometry.dispose();(trail.material as THREE.Material).dispose();floor.geometry.dispose();(floor.material as THREE.Material).dispose();grid.geometry.dispose();(grid.material as THREE.Material).dispose();ring.geometry.dispose();(ring.material as THREE.Material).dispose();environment?.dispose();gpu?.dispose();canvas.remove();};
    } catch(error){console.error("Unable to initialize 3D viewer",error);setFailure(true);if(renderer instanceof THREE.WebGLRenderer)renderer.dispose();}
    return()=>{alive=false;cancelAnimationFrame(raf);cleanup();};
  },[retry]);

  return <div ref={container} className="canvas-host">
    {compatible&&ready&&!failure&&<span className="compatibility-label">Mode compatible</span>}
    {!ready&&!failure&&<div className="viewer-loading"><LoaderCircle className="spin" size={24}/><span>Assemblage de la grue…</span></div>}
    {failure&&<div className="viewer-fallback"><img src="./reference/pk-53002-sh.jpg" alt="Rendu officiel de la PK 53002 SH repliée"/><div><strong>La 3D n’est pas disponible ici.</strong><p>Les caractéristiques restent consultables. Essaie de relancer la vue ou d’ouvrir le site dans Safari ou Chrome.</p><button onClick={()=>setRetry(v=>v+1)}><RotateCcw size={16}/>Relancer la 3D</button></div></div>}
    {PARTS.map(part=><button key={part.id} ref={el=>{buttons.current[part.id]=el;}} className={`hotspot ${props.selected===part.id?"is-selected":""}`} style={{visibility:"hidden"}} aria-label={`Explorer ${part.title}`} aria-pressed={props.selected===part.id} title={part.title} tabIndex={props.labels&&ready&&!failure?0:-1} onClick={()=>props.onSelect(part.id)}>{part.number}</button>)}
  </div>;
});
export default Viewer;
