import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './style.css';
const app=document.querySelector('#app');
app.innerHTML=`<div id="scene"></div><div id="vignette" aria-hidden="true"></div><div id="cctv-overlay" aria-hidden="true"><div class="cctv-label">CAM 01 · FRONT COUNTER</div><div class="cctv-time" id="cctv-time">00:00:00</div><div class="cctv-rec">● REC</div></div><header id="hud"><div class="brand"><span class="brand-mark">24H</span><span><strong>별밤 편의점</strong><small>SEOUL · 야간근무 00:00—08:00</small></span></div><div class="stats"><span id="clock"><small>REMAINING</small>08:00</span><span id="money"><small>SALES</small>₩0</span><span id="mental"><small>MENTAL</small>■■■■■</span><span id="score"><small>DECISIONS</small>0 / 0</span></div></header><main id="panel"><div class="panel-kicker" id="panel-kicker">NIGHT SHIFT · 001</div><h2 id="visitor">계산대 앞을 확인하세요</h2><p id="dialog">새벽의 편의점은 유난히 조용합니다.</p><div id="clues"></div><p id="hint">손님이 도착하면 단서를 확인하고 판단하세요.</p><div id="actions"><button id="pay" class="selected"><b>01</b> 계산</button><button id="ban"><b>02</b> 퇴치</button><button id="cctv"><b>03</b> CCTV</button><button id="torch"><b>04</b> 손전등</button></div><p id="status" role="status"></p></main><footer id="setup"><button id="config">INPUT CONFIG</button><button id="restart">RESTART SHIFT</button><button id="audio-toggle" aria-pressed="false">AUDIO OFF</button><span id="padstatus">GAMEPAD · 연결 대기 / 키보드 사용 가능</span></footer><div id="start-screen"><div class="start-card"><span class="eyebrow">NIGHT SHIFT · 00:00—08:00</span><h1>귀신도<br>편의점에 옵니다</h1><p>마지막 손님이 떠난 뒤에도,<br>매장의 문은 다시 열립니다.</p><button id="start-game">근무 시작 <span>ENTER</span></button><small>헤드폰 권장 · 키보드 / 아케이드 컨트롤러</small></div></div><div id="overlay" class="hidden"><div class="modal"><span class="eyebrow">CONTROLLER SETUP</span><h2>조이스틱 입력 설정</h2><p>물리 버튼을 누르거나 키보드 키를 눌러 명령을 지정하세요.</p><div id="mapping"></div><p id="capture"></p><button id="close">닫기</button></div></div>`;
const $=id=>document.getElementById(id);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x171310);scene.fog=new THREE.Fog(0x171310,19,37);
const camera=new THREE.PerspectiveCamera(67,innerWidth/innerHeight,.1,100);camera.position.set(0,2.2,6.6);camera.lookAt(0,1.6,-2);
const scareShade=new THREE.Mesh(new THREE.PlaneGeometry(40,24),new THREE.MeshBasicMaterial({color:0x050302,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
scareShade.position.z=-4.5;scareShade.renderOrder=1;camera.add(scareShade);
const scareFace=new THREE.Group();scareFace.position.set(0,-.02,-4.5);camera.add(scareFace);
function scarePart(geometry,material,x,y,z,scale,rotationZ=0){
  material.transparent=true;material.opacity=1;
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(...scale);mesh.rotation.z=rotationZ;mesh.renderOrder=2;scareFace.add(mesh);return mesh;
}
const scareSkin=new THREE.MeshBasicMaterial({color:0xb7a69a});
const scareHair=new THREE.MeshBasicMaterial({color:0x151210});
const scareSocket=new THREE.MeshBasicMaterial({color:0x211715});
const scareEye=new THREE.MeshBasicMaterial({color:0xc2b7a9});
const scareMouth=new THREE.MeshBasicMaterial({color:0x160d0c});
const scareTeeth=new THREE.MeshBasicMaterial({color:0x9d8e7c});
scarePart(new THREE.SphereGeometry(1,28,20),scareSkin,0,0,0,[.48,.61,.27]);
scarePart(new THREE.SphereGeometry(1,20,14),scareHair,0,.43,-.035,[.49,.31,.28]);
for(const side of [-1,1]){
  const brow=side<0?-1:1;
  scarePart(new THREE.SphereGeometry(1,16,12),scareSocket,side*.17,.1,.235,[.12,.17,.035],brow*.12);
  scarePart(new THREE.SphereGeometry(1,14,10),scareEye,side*.17,.08,.27,[.038,.052,.022]);
  scarePart(new THREE.SphereGeometry(1,12,10),scareSocket,side*.17,.08,.29,[.02,.035,.012]);
  scarePart(new THREE.CapsuleGeometry(.035,.12,3,7),scareHair,side*.17,.285,.23,[1,.72,.7],-brow*.19);
}
scarePart(new THREE.SphereGeometry(1,16,12),scareSkin,0,-.035,.295,[.055,.085,.075]);
scarePart(new THREE.SphereGeometry(1,18,14),scareMouth,0,-.31,.225,[.14,.19,.045]);
scarePart(new THREE.BoxGeometry(.17,.035,.018),scareTeeth,0,-.235,.272,[1,1,1]);
scareFace.visible=false;
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.querySelector('#scene').append(renderer.domElement);
const pmremGenerator=new THREE.PMREMGenerator(renderer);scene.environment=pmremGenerator.fromScene(new RoomEnvironment(),.04).texture;pmremGenerator.dispose();
const ambientLight=new THREE.HemisphereLight(0xb8a99a,0x171311,.48);scene.add(ambientLight);
const keyLight=new THREE.DirectionalLight(0xd2b99a,.36);keyLight.position.set(-3,7,4);keyLight.castShadow=true;keyLight.shadow.mapSize.set(1024,1024);keyLight.shadow.camera.left=-9;keyLight.shadow.camera.right=9;keyLight.shadow.camera.top=9;keyLight.shadow.camera.bottom=-9;keyLight.shadow.bias=-.00015;scene.add(keyLight);
const lamp=new THREE.PointLight(0xd6b581,10,16);lamp.position.set(0,4.25,-1);lamp.castShadow=true;lamp.shadow.mapSize.set(512,512);scene.add(lamp);
const materials={
  floor:new THREE.MeshStandardMaterial({color:0x655a4d,roughness:.9,metalness:.01}),
  wall:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.96}),
  trim:new THREE.MeshStandardMaterial({color:0x211c18,roughness:.65,metalness:.2}),
  shelf:new THREE.MeshStandardMaterial({color:0x45413c,roughness:.58,metalness:.55}),
  glass:new THREE.MeshPhysicalMaterial({color:0xb8afa0,roughness:.09,metalness:.04,transparent:true,opacity:.2,depthWrite:false,clearcoat:.65,clearcoatRoughness:.12}),
  screen:new THREE.MeshStandardMaterial({color:0x100e0c,roughness:.34,emissive:0x241815,emissiveIntensity:.22}),
  light:new THREE.MeshStandardMaterial({color:0xd9c8a9,emissive:0x92724c,emissiveIntensity:.55})
};
function box(w,h,d,x,y,z,color,material){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material||new THREE.MeshStandardMaterial({color,roughness:.72}));
  mesh.position.set(x,y,z);mesh.receiveShadow=true;mesh.castShadow=true;scene.add(mesh);return mesh;
}
function labelTexture(text,background,foreground){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const context=canvas.getContext('2d');
  if(!context)throw new Error('브랜드 간판을 그릴 2D 캔버스를 만들 수 없습니다.');
  context.fillStyle=background;context.fillRect(0,0,512,128);context.fillStyle=foreground;
  context.font='bold 68px sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(text,256,66);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
const signMaterial=new THREE.MeshStandardMaterial({map:labelTexture('별밤 24','#12394a','#e8f7ff'),emissive:0x28546a,emissiveIntensity:.55,roughness:.55});
const wallTextureCanvas=document.createElement('canvas');wallTextureCanvas.width=wallTextureCanvas.height=512;
const wallTextureContext=wallTextureCanvas.getContext('2d');
if(!wallTextureContext)throw new Error('벽 낡은 질감용 캔버스를 만들 수 없습니다.');
wallTextureContext.fillStyle='#625b50';wallTextureContext.fillRect(0,0,512,512);
for(let i=0;i<220;i++){
  const x=Math.random()*512,y=Math.random()*512,r=5+Math.random()*48;
  const stain=wallTextureContext.createRadialGradient(x,y,1,x,y,r);
  stain.addColorStop(0,`rgba(20,15,12,${.08+Math.random()*.2})`);stain.addColorStop(1,'rgba(20,15,12,0)');
  wallTextureContext.fillStyle=stain;wallTextureContext.fillRect(x-r,y-r,r*2,r*2);
}
for(let i=0;i<4800;i++){
  const shade=Math.floor(35+Math.random()*70);
  wallTextureContext.fillStyle=`rgba(${shade},${shade-5},${shade-10},${Math.random()*.2})`;
  wallTextureContext.fillRect(Math.random()*512,Math.random()*512,1+Math.random()*3,1+Math.random()*2);
}
for(let i=0;i<34;i++){
  const x=Math.random()*512,y=Math.random()*512;
  wallTextureContext.strokeStyle=`rgba(18,14,12,${.12+Math.random()*.15})`;wallTextureContext.lineWidth=1+Math.random()*2;
  wallTextureContext.beginPath();wallTextureContext.moveTo(x,y);wallTextureContext.lineTo(x+(Math.random()-.5)*18,y+12+Math.random()*54);wallTextureContext.stroke();
}
const wallTexture=new THREE.CanvasTexture(wallTextureCanvas);wallTexture.colorSpace=THREE.SRGBColorSpace;wallTexture.wrapS=wallTexture.wrapT=THREE.RepeatWrapping;wallTexture.repeat.set(2,1);
materials.wall.map=wallTexture;materials.wall.bumpMap=wallTexture;materials.wall.bumpScale=.035;
box(13,.18,17,0,-.12,-2,0,materials.floor);
const floorSurface=new THREE.Mesh(new THREE.PlaneGeometry(13,17),materials.floor);floorSurface.rotation.x=-Math.PI/2;floorSurface.position.set(0,-.024,-2);floorSurface.receiveShadow=true;scene.add(floorSurface);
const textureLoader=new THREE.TextureLoader();
function loadFloorMap(file,colorSpace=THREE.NoColorSpace){
  textureLoader.load(`${import.meta.env.BASE_URL}games/ghost-store/assets/${file}`,texture=>{
    texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,4);texture.colorSpace=colorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
    if(file.includes('normal'))materials.floor.normalMap=texture;
    else if(file.includes('roughness'))materials.floor.roughnessMap=texture;
    else if(file.includes('height')){materials.floor.bumpMap=texture;materials.floor.bumpScale=.035;}
    else materials.floor.map=texture;
    materials.floor.needsUpdate=true;
  },undefined,error=>{const warning=`바닥 재질을 불러오지 못했습니다: ${file}`;assetWarnings.push(warning);$('status').textContent=warning;console.error(error);});
}
const assetWarnings=[];
loadFloorMap('floor-albedo-2k.jpg',THREE.SRGBColorSpace);loadFloorMap('floor-normal-2k.jpg');loadFloorMap('floor-roughness-2k.jpg');loadFloorMap('floor-height-2k.jpg');
const grout=new THREE.MeshStandardMaterial({color:0x39342e,roughness:.97});
for(let x=-6.5;x<=6.5;x+=.75)box(.007,.006,17,x,-.018,-2,0,grout);
for(let z=-10.5;z<=6.5;z+=.75)box(13,.006,.007,0,-.018,z,0,grout);
const stainCanvas=document.createElement('canvas');stainCanvas.width=stainCanvas.height=256;
const stainContext=stainCanvas.getContext('2d');
if(!stainContext)throw new Error('바닥 오염 텍스처용 캔버스를 만들 수 없습니다.');
const stainGradient=stainContext.createRadialGradient(128,128,12,128,128,120);
stainGradient.addColorStop(0,'rgba(19,15,12,.54)');stainGradient.addColorStop(.52,'rgba(42,34,27,.32)');stainGradient.addColorStop(1,'rgba(48,39,30,0)');
stainContext.fillStyle=stainGradient;stainContext.fillRect(0,0,256,256);
for(let i=0;i<90;i++){const x=Math.random()*256,y=Math.random()*256,r=1+Math.random()*8;stainContext.fillStyle=`rgba(32,30,27,${Math.random()*.16})`;stainContext.beginPath();stainContext.ellipse(x,y,r,r*.55,Math.random(),0,Math.PI*2);stainContext.fill();}
const stainTexture=new THREE.CanvasTexture(stainCanvas);stainTexture.colorSpace=THREE.SRGBColorSpace;
for(let i=0;i<11;i++){
  const stain=new THREE.Mesh(new THREE.PlaneGeometry(.6+Math.random()*.75,.35+Math.random()*.65),new THREE.MeshBasicMaterial({map:stainTexture,transparent:true,depthWrite:false,opacity:.62}));
  stain.rotation.x=-Math.PI/2;stain.rotation.z=Math.random()*Math.PI;stain.position.set(-5.8+Math.random()*11.6,-.012,-9.8+Math.random()*15.2);scene.add(stain);
}
box(5.1,2.7,.25,-3.95,1.35,-10.5,0,materials.wall);box(5.1,2.7,.25,3.95,1.35,-10.5,0,materials.wall);
box(13,1.025,.25,0,4.4875,-10.5,0,materials.wall);
for(const side of [-1,1]){box(.15,1.25,.25,side*6.425,3.35,-10.5,0,materials.wall);box(2.45,1.25,.25,side*2.625,3.35,-10.5,0,materials.wall);}
box(.25,5,17,-6.5,2.5,-2,0,materials.wall);box(.25,5,17,6.5,2.5,-2,0,materials.wall);
box(13,.2,17,0,5,-2,0,materials.trim);
box(4.7,.1,.18,0,4.76,-10.34,0,materials.light);box(4.8,.06,.08,0,4.87,-10.3,0,materials.trim);
for(const x of [-5.1,5.1]){
  box(2.5,1.25,.12,x,3.35,-10.34,0,materials.trim);
  box(2.25,1.05,.035,x,3.35,-10.25,0,materials.glass);
}
const doorFrame=new THREE.MeshStandardMaterial({color:0xaab5bb,roughness:.27,metalness:.68});
for(const x of [-1.35,1.35])box(.1,2.65,.14,x,1.33,-10.28,0,doorFrame);
box(2.8,.1,.14,0,2.66,-10.28,0,doorFrame);box(2.8,.09,.14,0,.04,-10.28,0,doorFrame);
const doorLeft=box(1.3,2.5,.045,-.67,1.34,-10.3,0,materials.glass);const doorRight=box(1.3,2.5,.045,.67,1.34,-10.3,0,materials.glass);
let doorOpenUntil=0;function triggerDoor(duration=1400){doorOpenUntil=performance.now()+duration;playChime()}
box(.04,2.5,.07,0,1.34,-10.24,0,doorFrame);
const sensor=new THREE.MeshStandardMaterial({color:0x58d6c4,emissive:0x27a995,emissiveIntensity:1.4});
box(.34,.08,.12,0,2.78,-10.18,0,sensor);
box(4.3,.6,.16,0,4.22,-10.3,0,signMaterial);
const street=new THREE.Mesh(new THREE.PlaneGeometry(38,20),new THREE.MeshStandardMaterial({color:0x171310,roughness:1}));
street.rotation.x=-Math.PI/2;street.position.set(0,-.08,-18);street.receiveShadow=true;scene.add(street);
for(let i=0;i<7;i++){
  const x=-16+i*5;
  const building=box(4,5.5,2.2,x,2.65,-14.2,0x171614,new THREE.MeshStandardMaterial({color:0x171614,roughness:.98}));
  building.castShadow=false;
  for(let row=0;row<3;row++)for(let col=0;col<2;col++){
    const lit=(i+row+col)%5===0;
    box(.55,.7,.035,x-.8+col*1.5,1.2+row*1.35,-13.07,0x455565,new THREE.MeshStandardMaterial({color:lit?0x766047:0x24211e,emissive:lit?0x4d301b:0x100e0c,emissiveIntensity:lit?.34:.12,roughness:.8}));
  }
}
for(const x of [-4.1,4.1]){
  const pole=box(.11,4.1,.11,x,2.05,-13.1,0x28333a,doorFrame);pole.castShadow=false;
  box(.8,.12,.3,x,4.08,-13.1,0,new THREE.MeshStandardMaterial({color:0x9b7850,emissive:0x8c5429,emissiveIntensity:.65}));
  const streetLamp=new THREE.PointLight(0xc58b53,.75,7);streetLamp.position.set(x,3.85,-13.1);scene.add(streetLamp);
}
const shelfFixtures=[];
function makeShelf(x,z){
  const shelfRoot=new THREE.Group();shelfRoot.position.set(x,0,z);scene.add(shelfRoot);
  shelfFixtures.push(shelfRoot);
  const fixture=(w,h,d,px,py,pz,material)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(px,py,pz);mesh.castShadow=true;mesh.receiveShadow=true;shelfRoot.add(mesh);return mesh};
  const postMaterial=new THREE.MeshStandardMaterial({color:0x313638,roughness:.38,metalness:.78});
  for(const px of [-.88,.88])for(const pz of [-.31,.31]){
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,2.2,8),postMaterial);post.position.set(px,1.1,pz);post.castShadow=true;shelfRoot.add(post);
    fixture(.095,.025,.095,px,.045,pz,materials.shelf);
  }
  for(const level of [0,.53,1.06,1.59,2.12]){
    fixture(1.84,.035,.66,0,level,0,materials.shelf);
    fixture(1.84,.11,.035,0,level+.07,.32,materials.trim);
    fixture(1.84,.025,.025,0,level+.13,.3,postMaterial);
  }
  for(let level=0;level<4;level++){
    const y=.17+level*.53;
    for(let item=0;item<8;item++){
      const px=-.77+item*.22,kind=(item+level)%4;
      const colors=[0x597f88,0x9a7252,0x827c66,0x5e6972],color=colors[(item+level*3)%colors.length];
      const material=new THREE.MeshStandardMaterial({color,roughness:.4,metalness:kind===0?.14:.02});
      if(kind===0){
        const can=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.31,16),material);
        can.position.set(px,y+.17,.08);can.castShadow=true;shelfRoot.add(can);
        const lid=new THREE.Mesh(new THREE.CylinderGeometry(.057,.057,.009,16),new THREE.MeshStandardMaterial({color:0x9a9d98,metalness:.82,roughness:.22}));
        lid.position.set(px,y+.328,.08);shelfRoot.add(lid);
      }else{
        const width=kind===1?.15:.18,height=kind===2?.27:.34;
        fixture(width,height,.19,px,y+height/2,.08,material);
        fixture(width*.72,.025,.006,px,y+height*.58,.178,new THREE.MeshStandardMaterial({color:0xc4bca8,roughness:.52}));
      }
    }
  }
}
makeShelf(-4.95,-6.7);makeShelf(-4.95,-3.5);makeShelf(4.95,-2.4);
async function loadShelfModels(){
  try{
    const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
    const gltf=await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'games/ghost-store/assets/wire-shelving-with-casters.glb');
    shelfFixtures.forEach(fallback=>{
      const model=gltf.scene.clone(true),x=fallback.position.x,z=fallback.position.z;
      model.scale.set(2.05,1.15,1.45);
      model.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;if(object.material)object.material.envMapIntensity=1.1;}});
      for(let row=0;row<4;row++)for(let column=0;column<5;column++){
        const productColor=[0x7d483f,0x6b7880,0x93804f,0x5b6f63,0x796456][(column+row*2)%5];
        const productMaterial=new THREE.MeshStandardMaterial({color:productColor,roughness:.38,metalness:column===1?.12:.02});
        const px=-.33+column*.165,py=.24+row*.39;
        if(column%2===0){
          const can=new THREE.Mesh(new THREE.CylinderGeometry(.043,.043,.2,14),productMaterial);can.position.set(px,py,.19);can.castShadow=true;model.add(can);
          const rim=new THREE.Mesh(new THREE.CylinderGeometry(.039,.039,.006,14),new THREE.MeshStandardMaterial({color:0xb1b2aa,metalness:.7,roughness:.3}));rim.position.set(px,py+.103,.19);model.add(rim);
        }else{
          const pack=new THREE.Mesh(new THREE.BoxGeometry(.105,.19,.08),productMaterial);pack.position.set(px,py,.18);pack.castShadow=true;model.add(pack);
          const stripe=new THREE.Mesh(new THREE.BoxGeometry(.075,.026,.005),new THREE.MeshStandardMaterial({color:0xd2c9b0,roughness:.55}));stripe.position.set(px,py+.025,.223);model.add(stripe);
        }
      }
      const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());
      model.position.set(x-center.x,-bounds.min.y,z-center.z);scene.add(model);fallback.visible=false;
    });
  }catch(error){
    const warning='철제 진열대 3D 모델을 불러오지 못했습니다. 절차적 진열대를 표시합니다.';
    assetWarnings.push(warning);$('status').textContent=warning;console.error(error);
  }
}
void loadShelfModels();
box(1.25,2.9,.8,5.78,1.46,-6.3,0,materials.trim);
box(1.2,2.5,.025,5.78,1.5,-5.91,0,materials.glass);
const fridgeFrame=new THREE.MeshStandardMaterial({color:0x68635a,roughness:.38,metalness:.68});
for(const x of [5.16,6.4])box(.045,2.55,.72,x,1.48,-6.3,0,fridgeFrame);
for(const y of [.24,2.72])box(1.3,.055,.72,5.78,y,-6.3,0,fridgeFrame);
for(let level=0;level<4;level++)box(1.1,.035,.5,5.78,.46+level*.58,-6.47,0,materials.shelf);
const fridgeStrip=new THREE.MeshStandardMaterial({color:0xc9d2c8,emissive:0x77968f,emissiveIntensity:.95});
box(.025,2.2,.03,5.22,1.5,-5.91,0,fridgeStrip);
box(.025,2.2,.03,6.34,1.5,-5.91,0,fridgeStrip);
const fridgeLight=new THREE.PointLight(0x9bb7ad,1.8,2.8);fridgeLight.position.set(5.78,1.6,-5.7);scene.add(fridgeLight);
for(let level=0;level<4;level++)for(let i=0;i<9;i++){
  const color=[0x536e68,0x9a684e,0x747d82,0x596f7d][(level+i)%4];
  const can=new THREE.Mesh(new THREE.CylinderGeometry(.052,.052,.27,18),new THREE.MeshStandardMaterial({color,roughness:.25,metalness:.38}));
  can.position.set(5.28+i*.122,.48+level*.58,-6.28);can.castShadow=true;scene.add(can);
}
const glassHighlight=new THREE.Mesh(new THREE.PlaneGeometry(.015,2.2),new THREE.MeshBasicMaterial({color:0xb8c2b9,transparent:true,opacity:.12,depthWrite:false}));
glassHighlight.position.set(5.55,1.5,-5.94);scene.add(glassHighlight);
box(1.15,.12,.12,5.78,2.76,-6.3,0,materials.light);
const counterBody=new THREE.MeshStandardMaterial({color:0x39332d,roughness:.86,metalness:.08});
const counterTop=new THREE.MeshStandardMaterial({color:0x62584a,roughness:.72,metalness:.12});
const counterGroup=new THREE.Group();scene.add(counterGroup);
function counterBox(w,h,d,x,y,z,material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;counterGroup.add(mesh);return mesh}
counterBox(4.15,1.02,1.05,0,.53,2.5,counterBody);counterBox(4.3,.09,1.2,0,1.09,2.5,counterTop);
counterBox(4.15,.12,.09,0,.55,3.05,materials.trim);
counterBox(.08,.18,.78,-1.15,1.2,2.36,new THREE.MeshStandardMaterial({color:0xd8e1e5,metalness:.7,roughness:.3}));
counterBox(.54,.3,.38,1.1,1.27,2.3,materials.trim);counterBox(.5,.23,.035,1.1,1.29,2.1,materials.screen).rotation.x=-.12;
counterBox(.2,.1,.16,.35,1.18,2.45,new THREE.MeshStandardMaterial({color:0x2d3032,metalness:.7,roughness:.25}));
counterBox(.34,.08,.22,2.08,1.17,2.42,materials.trim);counterBox(.28,.025,.16,2.08,1.22,2.42,sensor);
async function loadCounterModel(){
  try{
    const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
    const gltf=await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'games/ghost-store/assets/checkout-counter-with-pos-original-retail-fixture.glb');
    const model=gltf.scene;model.scale.set(1.55,1.02,1.18);
    model.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;if(object.material){object.material.envMapIntensity=.75;object.material.color.multiplyScalar(.52);object.material.metalness=Math.min(object.material.metalness||0,.55);object.material.roughness=Math.max(object.material.roughness||.35,.46);}}});
    const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x,-bounds.min.y,2.5-center.z);scene.add(model);counterGroup.visible=false;
  }catch(error){
    const warning='POS 3D 모델을 불러오지 못했습니다. 대체 계산대를 표시합니다.';
    assetWarnings.push(warning);$('status').textContent=warning;console.error(error);
  }
}
void loadCounterModel();
box(2,.1,.22,0,4.7,-1,0,materials.light);
const ceilingFixtures=[];
for(const z of [-6,-2,2])for(const x of [-2,2]){
  box(1.4,.075,.5,x,4.77,z,0,materials.trim);
  const fixtureIndex=ceilingFixtures.length;
  const lit=[0,2,3,5].includes(fixtureIndex);
  const diffuser=new THREE.MeshStandardMaterial({color:lit?0xcbb88f:0x38332b,emissive:lit?0xa57d45:0x17130f,emissiveIntensity:lit?.4:.035,roughness:.42});
  box(1.18,.018,.32,x,4.72,z,0,diffuser);
  const ceilingLamp=new THREE.PointLight(0xd0ae78,lit?(fixtureIndex===2?2.1:3.1):.025,7);
  ceilingLamp.position.set(x,4.45,z);ceilingLamp.userData.baseIntensity=lit?(fixtureIndex===2?2.1:3.1):.025;ceilingLamp.userData.diffuser=diffuser;ceilingLamp.userData.baseGlow=lit?.4:.035;scene.add(ceilingLamp);ceilingFixtures.push(ceilingLamp);
}
const appearances=[
  {skin:0xe2b99c,hair:0x49372f,outfit:0x426b87,pants:0x273444,hairStyle:'short',accessory:'hoodie'},
  {skin:0xd2a88f,hair:0x201a20,outfit:0x655260,pants:0x282a33,hairStyle:'long',accessory:'scarf'},
  {skin:0xc89577,hair:0x30251f,outfit:0x5b6264,pants:0x30343b,hairStyle:'short',accessory:'tie'},
  {skin:0xe3c8b4,hair:0x15171e,outfit:0x252b39,pants:0x20232d,hairStyle:'long',accessory:'coat'},
  {skin:0xd8ad8b,hair:0x82745f,outfit:0x62705a,pants:0x3b4037,hairStyle:'bun',accessory:'cardigan'},
  {skin:0xbfa391,hair:0x34333b,outfit:0x39414b,pants:0x252830,hairStyle:'hood',accessory:'hood'}
];
const characterActors=[];
function makeCharacter(look){
  const root=new THREE.Group();scene.add(root);root.visible=false;
  const skin=new THREE.MeshStandardMaterial({color:look.skin,roughness:.88});
  const hair=new THREE.MeshStandardMaterial({color:look.hair,roughness:.94});
  const clothes=new THREE.MeshStandardMaterial({color:look.outfit,roughness:.82});
  const trousers=new THREE.MeshStandardMaterial({color:look.pants,roughness:.88});
  const accent=new THREE.MeshStandardMaterial({color:look.accessory==='scarf'?0x9d4655:0xb3a16d,roughness:.75});
  const eyeMaterial=new THREE.MeshStandardMaterial({color:0x25212a,roughness:.55});
  const ghostSocketMaterial=new THREE.MeshStandardMaterial({color:0x34221e,roughness:.96,transparent:true,opacity:.48,depthWrite:false});
  const ghostDetails=[];
  function part(geometry,material,parent,position,scale){
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);
    if(scale)mesh.scale.set(...scale);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  const torso=part(new THREE.CapsuleGeometry(.265,.54,5,10),clothes,root,[0,1.2,0],[1,.95,.76]);
  part(new THREE.CylinderGeometry(.07,.075,.13,10),skin,root,[0,1.62,0]);
  const headPivot=new THREE.Group();headPivot.position.set(0,1.76,0);root.add(headPivot);
  part(new THREE.SphereGeometry(.225,20,16),skin,headPivot,[0,.06,0],[.9,1.04,.86]);
  part(new THREE.SphereGeometry(.235,18,12),hair,headPivot,[0,.2,-.045],[1,.58,.93]);
  if(look.hairStyle==='long'){
    part(new THREE.SphereGeometry(.19,14,12),hair,headPivot,[0,-.06,-.13],[1.05,1.15,.72]);
    for(const side of [-1,1])part(new THREE.CapsuleGeometry(.045,.23,3,6),hair,headPivot,[side*.19,0,.005]);
  }else if(look.hairStyle==='bun'){
    part(new THREE.SphereGeometry(.105,12,10),hair,headPivot,[0,.23,-.19]);
  }else if(look.hairStyle==='hood'){
    part(new THREE.SphereGeometry(.275,16,12),clothes,headPivot,[0,.06,-.055],[1.05,1.12,.9]);
  }else{
    part(new THREE.CapsuleGeometry(.045,.12,3,6),hair,headPivot,[0,.07,.17]);
  }
  for(const side of [-1,1]){
    part(new THREE.SphereGeometry(.035,10,8),skin,headPivot,[side*.218,.05,0]);
    const socket=part(new THREE.SphereGeometry(.047,12,8),ghostSocketMaterial,headPivot,[side*.082,.075,.187],[1.18,.78,.26]);
    socket.visible=false;ghostDetails.push(socket);
    part(new THREE.SphereGeometry(.034,12,8),new THREE.MeshStandardMaterial({color:0xd8d3c9,roughness:.28}),headPivot,[side*.082,.08,.185],[.78,1,.55]);
    part(new THREE.SphereGeometry(.015,10,8),eyeMaterial,headPivot,[side*.082,.08,.207],[.8,1,.48]);
    part(new THREE.CapsuleGeometry(.012,.065,3,6),hair,headPivot,[side*.083,.145,.179],[1,.48,.8]);
    const leg=new THREE.Group();leg.position.set(side*.13,.87,0);root.add(leg);
    part(new THREE.CapsuleGeometry(.105,.43,4,8),trousers,leg,[0,-.3,0]);
    part(new THREE.BoxGeometry(.16,.105,.31),new THREE.MeshStandardMaterial({color:0x25272b,roughness:.72}),leg,[0,-.59,.075]);
    const arm=new THREE.Group();arm.position.set(side*.31,1.43,0);root.add(arm);
    part(new THREE.CapsuleGeometry(.085,.3,4,7),clothes,arm,[0,-.2,0],[1,1,.95]);
    const forearm=new THREE.Group();forearm.position.set(0,-.39,0);arm.add(forearm);
    part(new THREE.CapsuleGeometry(.065,.27,4,7),look.accessory==='coat'?clothes:skin,forearm,[0,-.17,.015]);
    part(new THREE.SphereGeometry(.072,8,6),skin,forearm,[0,-.35,.035],[.8,1,.65]);
    if(side===1){
      const product=new THREE.Group();product.position.set(0,-.43,.12);product.visible=false;forearm.add(product);
      part(new THREE.CylinderGeometry(.047,.05,.18,10),new THREE.MeshStandardMaterial({color:0x54a8b2,roughness:.32,metalness:.16}),product,[0,0,0]);
      part(new THREE.CylinderGeometry(.025,.025,.045,8),new THREE.MeshStandardMaterial({color:0xd9e0dc,metalness:.55,roughness:.3}),product,[0,.11,0]);
      var heldItem=product;
    }
    if(!root.userData.limbs)root.userData.limbs={arms:[],legs:[],forearms:[]};
    root.userData.limbs.arms.push(arm);root.userData.limbs.legs.push(leg);root.userData.limbs.forearms.push(forearm);
  }
  part(new THREE.SphereGeometry(.032,10,8),skin,headPivot,[0,-.005,.205],[.82,1.2,1]);
  part(new THREE.CapsuleGeometry(.012,.065,3,6),new THREE.MeshStandardMaterial({color:0x684d4d,roughness:.7}),headPivot,[0,-.105,.175],[1,.45,.7]);
  if(look.accessory==='scarf'||look.accessory==='tie'){
    part(new THREE.CylinderGeometry(.045,.075,.34,8),accent,root,[0,1.35,.2],[1,.6,.5]);
  }
  if(look.accessory==='hoodie'||look.accessory==='cardigan'){
    part(new THREE.BoxGeometry(.22,.34,.07),accent,root,[.19,1.31,.185],[.8,1,.7]);
  }
  const bag=new THREE.Group();bag.position.set(-.31,1.13,-.12);root.add(bag);
  part(new THREE.BoxGeometry(.25,.32,.13),new THREE.MeshStandardMaterial({color:look.accessory==='hoodie'?0x51473d:0x34343c,roughness:.86}),bag,[0,0,0]);
  part(new THREE.TorusGeometry(.13,.018,5,12,Math.PI),accent,bag,[0,.17,.005]);
  return {root,torso,head:headPivot,limbs:root.userData.limbs,item:heldItem,ghostDetails};
}
for(const look of appearances)characterActors.push(makeCharacter(look));
async function loadCustomerModels(){
  try{
    const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
    const gltf=await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'games/ghost-store/assets/daniel-man-1k.glb');
    characterActors.forEach((actor,index)=>{
      const model=gltf.scene.clone(true),look=appearances[index];
      model.scale.setScalar(.94+(index%3)*.055);
      model.traverse(object=>{
        if(!object.isMesh)return;
        object.castShadow=true;object.receiveShadow=true;
        const tint=object.material;
        object.material=Array.isArray(tint)?tint.map(material=>material.clone()):tint.clone();
        const variants=Array.isArray(object.material)?object.material:[object.material];
        variants.forEach(material=>{
          const name=material.name.toLowerCase();
          if(name.includes('casual'))material.color.lerp(new THREE.Color(look.outfit),.24);
          else if(name.includes('skin')){
            material.color.lerp(new THREE.Color(look.skin),.12);
            if([1,3,5].includes(index))material.color.lerp(new THREE.Color(0xb9b8b1),.2);
          }
          else if(name.includes('hair'))material.color.lerp(new THREE.Color(look.hair),.16);
          material.envMapIntensity=1;material.roughness=Math.max(material.roughness||.6,.38);
        });
      });
      const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());
      model.position.set(-center.x,-bounds.min.y,-center.z);actor.root.add(model);actor.realModel=model;
      actor.root.children.forEach(child=>{if(child!==model)child.visible=false;});
      const held=new THREE.Group();held.visible=false;held.position.set(.22,.92,.22);actor.root.add(held);
      const bottle=new THREE.Mesh(new THREE.CylinderGeometry(.04,.05,.2,16),new THREE.MeshStandardMaterial({color:0x72847a,roughness:.24,metalness:.12}));
      bottle.castShadow=true;held.add(bottle);
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(.026,.026,.035,12),new THREE.MeshStandardMaterial({color:0xaaa99d,roughness:.35,metalness:.5}));
      cap.position.y=.117;held.add(cap);actor.item=held;
    });
  }catch(error){
    const warning='실사형 손님 모델을 불러오지 못했습니다. 절차적 대체 캐릭터를 표시합니다.';
    assetWarnings.push(warning);$('status').textContent=warning;console.error(error);
  }
}
void loadCustomerModels();
let activeActor=characterActors[0],person=activeActor.root;
const shadow=new THREE.Mesh(new THREE.CircleGeometry(.5,24),new THREE.MeshBasicMaterial({color:0x08080b,transparent:true,opacity:.4,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;scene.add(shadow);
let state={money:0,mental:5,correct:0,total:0,remaining:480,active:false,ghost:false,selection:0,cctv:false,torch:false,over:false,started:false};let customerPhase='idle',route=[],routeIndex=0,phaseElapsed=0,browseDuration=1.8,audioContext=null,audioMaster=null,audioEnabled=false;
let scareActive=false,scareElapsed=0,scareFinishAfter=false,scareLights=[],scareCameraPosition=new THREE.Vector3(),scareCameraQuaternion=new THREE.Quaternion();
let previousGait=0;
function startAmbience(){
  if(!audioContext){audioContext=new AudioContext();audioMaster=audioContext.createGain();audioMaster.gain.value=.32;audioMaster.connect(audioContext.destination);
    for(const [frequency,gainValue,type] of [[58,.018,'sine'],[91,.009,'triangle'],[120,.006,'sawtooth']]){
      const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),filter=audioContext.createBiquadFilter();
      oscillator.type=type;oscillator.frequency.value=frequency;filter.type='lowpass';filter.frequency.value=type==='sawtooth'?180:320;gain.gain.value=gainValue;
      oscillator.connect(filter);filter.connect(gain);gain.connect(audioMaster);oscillator.start();
    }
  }
  audioContext.resume();audioMaster.gain.setTargetAtTime(.32,audioContext.currentTime,.18);audioEnabled=true;$('audio-toggle').textContent='AUDIO ON';$('audio-toggle').setAttribute('aria-pressed','true');
}
function stopAmbience(){audioEnabled=false;$('audio-toggle').textContent='AUDIO OFF';$('audio-toggle').setAttribute('aria-pressed','false');if(audioMaster)audioMaster.gain.setTargetAtTime(0,audioContext.currentTime,.12);}
function playChime(){
  if(!audioEnabled||!audioContext)return;
  const now=audioContext.currentTime;audioMaster.gain.setTargetAtTime(.32,now,.15);
  for(const [frequency,offset] of [[784,0],[1175,.12]]){
    const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();
    oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,now+offset);gain.gain.exponentialRampToValueAtTime(.045,now+offset+.025);gain.gain.exponentialRampToValueAtTime(.0001,now+offset+.65);
    oscillator.connect(gain);gain.connect(audioMaster);oscillator.start(now+offset);oscillator.stop(now+offset+.7);
  }
}
function playFootstep(){
  if(!audioEnabled||!audioContext)return;
  const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),now=audioContext.currentTime;
  oscillator.type='triangle';oscillator.frequency.setValueAtTime(92,now);oscillator.frequency.exponentialRampToValueAtTime(48,now+.11);
  gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.018,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+.14);
  oscillator.connect(gain);gain.connect(audioMaster);oscillator.start(now);oscillator.stop(now+.15);
}
function playScareSound(){
  if(!audioEnabled||!audioContext)return;
  const now=audioContext.currentTime;
  for(const [type,startFrequency,endFrequency,peak,duration] of [['sawtooth',138,48,.055,.62],['triangle',470,128,.022,.38]]){
    const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),filter=audioContext.createBiquadFilter();
    oscillator.type=type;oscillator.frequency.setValueAtTime(startFrequency,now);oscillator.frequency.exponentialRampToValueAtTime(endFrequency,now+duration);
    filter.type='lowpass';filter.frequency.value=type==='sawtooth'?520:1100;
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(peak,now+.035);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    oscillator.connect(filter);filter.connect(gain);gain.connect(audioMaster);oscillator.start(now);oscillator.stop(now+duration+.01);
  }
}
const customers=[['늦은 밤의 학생','이 음료 계산해주세요.','영수증을 부탁해요.',false],['젖은 우산의 손님','밖에 비가... 내렸나요?','여기 몇 년도죠?',true],['피곤한 회사원','삼각김밥 하나요.','교통카드로 결제할게요.',false],['검은 코트의 손님','거울에는 제가 안 보이나요?','아무것도 기억나지 않아요.',true],['동네 주민','오늘도 야근하시네요.','봉투는 괜찮아요.',false],['새벽의 방문자','문은 잠겨 있었는데요.','저는 이미 죽었어요.',true]];
let index=-1,previousAppearance=-1;
const phaseLabels={entering:'입장 중',browsing:'진열대 확인 중',approaching:'계산대로 이동 중',waiting:'계산 대기',leaving:'퇴장 중',complete:'근무 종료'};
function updatePhaseLabel(phase=customerPhase){$('panel-kicker').textContent=`손님 ${String(Math.max(0,index+1)).padStart(2,'0')} · ${phaseLabels[phase]||'대기'}`;}
function setRoute(phase,points){customerPhase=phase;route=points.map(([x,z])=>new THREE.Vector3(x,0,z));routeIndex=0;phaseElapsed=0;updatePhaseLabel(phase);}
function next(){
  if(state.over||!state.started)return;
  index=(index+1)%customers.length;state.ghost=customers[index][3];state.active=false;state.cctv=false;state.torch=false;
  $('cctv-overlay').classList.remove('visible');
  for(const actor of characterActors)actor.root.visible=false;
  let appearanceIndex;do{appearanceIndex=Math.floor(Math.random()*characterActors.length);}while(characterActors.length>1&&appearanceIndex===previousAppearance);
  previousAppearance=appearanceIndex;activeActor=characterActors[appearanceIndex];person=activeActor.root;person.position.set(0,0,-11.35);person.rotation.y=0;person.visible=true;
  activeActor.ghostDetails.forEach(detail=>detail.visible=state.ghost);
  shadow.visible=!state.ghost;shadow.position.set(0,.025,-11.35);
  activeActor.item.visible=false;browseDuration=1.35+(index%3)*.45;
  const browseX=index%2===0?2.7:-2.55,customerX=index%2===0?-.65:.65;
  person.userData.routePoints={browseX,customerX};
  setRoute('entering',[[0,-9.2],[browseX,-7.45]]);
  triggerDoor(4000);
  $('visitor').textContent=customers[index][0];$('dialog').textContent='“'+customers[index][1]+'”';$('clues').textContent='대화 단서: '+customers[index][2];$('hint').textContent='손님이 매장을 살펴보는 중입니다. 계산대에 도착할 때까지 기다리세요.';$('status').textContent=assetWarnings.join(' · ');update();
}
function update(){
  $('clock').innerHTML=`<small>REMAINING</small>${String(Math.floor(state.remaining/60)).padStart(2,'0')}:${String(state.remaining%60).padStart(2,'0')}`;
  $('money').innerHTML=`<small>SALES</small>₩${state.money.toLocaleString()}`;
  $('mental').innerHTML=`<small>MENTAL</small>${'■'.repeat(Math.max(0,state.mental))}${'□'.repeat(Math.min(5,Math.max(0,5-state.mental)))}`;
  $('score').innerHTML=`<small>DECISIONS</small>${state.correct} / ${state.total}`;
  [...$('actions').children].forEach((button,i)=>button.classList.toggle('selected',i===state.selection));
  updateActionControls();
}
function updateActionControls(){
  const canDecide=state.active&&customerPhase==='waiting';
  $('actions').querySelectorAll('button').forEach(button=>{
    const decision=button.id==='pay'||button.id==='ban';
    button.disabled=state.over||scareActive||(decision&&!canDecide);
  });
}
function startGame(){
  if(state.started&&!state.over)return;
  $('start-screen').classList.add('hidden');state.started=true;state.over=false;startAmbience();next();
}
function startScare(){
  if(scareActive)return;
  state.cctv=false;state.torch=false;$('cctv-overlay').classList.remove('visible');
  scareActive=true;scareElapsed=0;scareCameraPosition.copy(camera.position);scareCameraQuaternion.copy(camera.quaternion);
  scareLights=[ambientLight,keyLight,lamp,fridgeLight,...ceilingFixtures].map(light=>({light,intensity:light.intensity,glow:light.userData.diffuser?.emissiveIntensity}));
  scareFace.visible=true;scareFace.position.set(0,-.02,-4.5);scareFace.scale.setScalar(.02);scareShade.material.opacity=0;
  updateActionControls();
  playScareSound();
}
function endScare(){
  if(!scareActive)return;
  scareActive=false;scareElapsed=0;scareShade.material.opacity=0;scareFace.visible=false;scareFace.position.set(0,-.02,-4.5);scareFace.scale.setScalar(1);
  scareLights.forEach(({light,intensity,glow})=>{light.intensity=intensity;if(glow!==undefined)light.userData.diffuser.emissiveIntensity=glow;});
  scareLights=[];
  camera.position.copy(scareCameraPosition);camera.quaternion.copy(scareCameraQuaternion);
  updateActionControls();
}
function updateScare(dt){
  if(!scareActive)return;
  scareElapsed+=dt;const progress=Math.min(scareElapsed/1.42,1);
  const blackout=progress<.13?progress/.13:progress<.7?1:1-(progress-.7)/.3;
  scareShade.material.opacity=.88*THREE.MathUtils.clamp(blackout,0,1);
  const approach=THREE.MathUtils.clamp((progress-.1)/.42,0,1),ease=1-Math.pow(1-approach,3);
  const retreat=THREE.MathUtils.clamp((progress-.66)/.34,0,1),fade=1-Math.pow(retreat,2);
  scareFace.position.z=THREE.MathUtils.lerp(-4.5,-1.48,ease);
  scareFace.scale.setScalar(.02+1.24*ease*fade);
  const shake=1-THREE.MathUtils.clamp(scareElapsed/1.08,0,1);
  camera.position.copy(scareCameraPosition);
  camera.position.x+=Math.sin(scareElapsed*47)*.032*shake;
  camera.position.y+=Math.sin(scareElapsed*35)*.018*shake;
  camera.quaternion.copy(scareCameraQuaternion);
  camera.rotation.z+=Math.sin(scareElapsed*39)*.008*shake;
  const lightLevel=1-blackout*.9;
  scareLights.forEach(({light,intensity,glow})=>{light.intensity=light.userData.baseIntensity!==undefined?light.userData.baseIntensity*lightLevel:intensity*lightLevel;if(glow!==undefined)light.userData.diffuser.emissiveIntensity=light.userData.baseGlow*lightLevel;});
  if(progress>=1)endScare();
  if(progress>=1&&scareFinishAfter){scareFinishAfter=false;finish();}
}
function finish(){endScare();state.over=true;state.active=false;customerPhase='idle';updatePhaseLabel('complete');for(const actor of characterActors)actor.root.visible=false;shadow.visible=false;$('visitor').textContent='근무 종료';$('dialog').textContent=`판별 ${state.correct}/${state.total} · 최종 매출 ₩${state.money.toLocaleString()}`;$('clues').textContent=state.mental<=0?'정신력이 소진되었습니다.':'새벽까지 근무를 마쳤습니다.';$('hint').textContent='RESTART SHIFT를 눌러 다시 시작하세요.';$('status').textContent='근무가 종료되었습니다.';updateActionControls();}
function action(which){
  if(state.over||!state.started||scareActive)return;
  if(which===2){state.cctv=!state.cctv;$('cctv-overlay').classList.toggle('visible',state.cctv);$('status').textContent=state.cctv?(state.ghost?'CCTV에 손님의 모습이 기록되지 않았습니다.':'CCTV 영상에 손님이 확인됩니다.'):'CCTV 화면을 닫았습니다.';return;}
  if(which===3){state.torch=!state.torch;$('status').textContent=state.torch?(state.ghost?'손님 뒤쪽에서 설명할 수 없는 반사가 보입니다.':'특별한 이상은 보이지 않습니다.'):'손전등을 껐습니다.';return;}
  if(!state.active||customerPhase!=='waiting')return;
  const correct=(which===1)===state.ghost;state.total++;
  if(correct){state.correct++;if(which===0)state.money+=5500;$('status').textContent='✓ 올바른 판단!';}
  else{if(which===0){state.mental-=2;startScare();}else state.money=Math.max(0,state.money-3000);$('status').textContent=which===0?'✕ 귀신에게 계산했어요! 멘탈 -2':'✕ 사람을 퇴치했어요! 매출 -₩3,000';}
  state.active=false;activeActor.item.visible=false;update();
  if(state.mental<=0){if(scareActive)scareFinishAfter=true;else finish();return;}
  const {customerX}=person.userData.routePoints;
  setRoute('leaving',[[customerX,-4.1],[0,-8.8],[0,-11.35]]);triggerDoor(7500);
  $('hint').textContent='손님이 퇴장하고 있습니다.';
}
function updateCustomer(dt,time){
  if(customerPhase==='browsing'){
    phaseElapsed+=dt;
    if(phaseElapsed>=.55)activeActor.item.visible=true;
    if(phaseElapsed>=browseDuration){
      const {browseX,customerX}=person.userData.routePoints;
      setRoute('approaching',[[browseX,-4.2],[customerX,1.05]]);
    }
  }else if(['entering','approaching','leaving'].includes(customerPhase)){
    const target=route[routeIndex];
    if(target){
      const dx=target.x-person.position.x,dz=target.z-person.position.z,distance=Math.hypot(dx,dz),step=1.9*dt;
      if(distance<=step){person.position.x=target.x;person.position.z=target.z;routeIndex++;}
      else{
        person.position.x+=dx/distance*step;person.position.z+=dz/distance*step;
        person.rotation.y=Math.atan2(dx,dz);
      }
    }
    if(routeIndex>=route.length){
      if(customerPhase==='entering'){setRoute('browsing',[]);}
      else if(customerPhase==='approaching'){
        customerPhase='waiting';state.active=true;person.rotation.y=0;
        updatePhaseLabel();
        updateActionControls();
        $('hint').textContent='손님이 계산대에서 기다립니다. 단서를 확인하고 계산 또는 퇴치를 선택하세요.';
      }else{
        person.visible=false;shadow.visible=false;customerPhase='idle';next();return;
      }
    }
  }
  const walking=['entering','approaching','leaving'].includes(customerPhase);
  const gait=walking?Math.sin(time*.009):0;
  if(walking&&Math.sign(gait)!==Math.sign(previousGait)&&Math.abs(gait)>.8)playFootstep();
  previousGait=gait;
  activeActor.limbs.legs.forEach((leg,i)=>{leg.rotation.x=walking?gait*(i===0?1:-1)*.62:Math.sin(time*.002+i)*.025;});
  activeActor.limbs.arms.forEach((arm,i)=>{
    const side=i===0?-1:1;
    arm.rotation.x=walking?-gait*(side)*.48:0;
    arm.rotation.z=walking?side*.04:0;
  });
  activeActor.limbs.forearms.forEach((forearm,i)=>{
    forearm.rotation.x=customerPhase==='browsing'&&i===1?-Math.min(1,phaseElapsed/.65)*1.05:0;
  });
  activeActor.torso.position.y=1.2+(walking?Math.abs(gait)*.018:Math.sin(time*.002)*.008);
  activeActor.head.rotation.x=state.ghost&&customerPhase==='waiting'&&Math.sin(time*.00043)> .87?-.34:Math.sin(time*.0007)*.025;
  activeActor.head.rotation.z=state.ghost&&customerPhase==='waiting'?.035+Math.sin(time*.0005)*.045:Math.sin(time*.0008)*.012;
  shadow.position.x=person.position.x;shadow.position.z=person.position.z;
  shadow.visible=person.visible&&!state.ghost;
}
$('pay').onclick=()=>action(0);$('ban').onclick=()=>action(1);$('cctv').onclick=()=>action(2);$('torch').onclick=()=>action(3);
$('start-game').onclick=startGame;
$('audio-toggle').onclick=()=>{if(audioEnabled)stopAmbience();else startAmbience()};
$('restart').onclick=()=>{endScare();scareFinishAfter=false;state={money:0,mental:5,correct:0,total:0,remaining:480,active:false,ghost:false,selection:0,cctv:false,torch:false,over:false,started:true};$('start-screen').classList.add('hidden');next()};
const commands=['계산 / 확인','퇴치 / 취소','CCTV','손전등'];const mapping={buttons:[0,1,2,3],keys:['KeyZ','KeyX','KeyC','KeyV']};let capture=-1,previousButtons=[];
function showMapping(){$('mapping').innerHTML=commands.map((v,i)=>`<button data-map="${i}">${v}: 버튼 ${mapping.buttons[i]+1} / ${mapping.keys[i]}</button>`).join('');document.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{capture=Number(b.dataset.map);$('capture').textContent=`${commands[capture]}: 조이스틱 버튼 또는 키보드 키를 눌러주세요.`;});}
$('config').onclick=()=>{$('overlay').classList.remove('hidden');showMapping()};$('close').onclick=()=>{$('overlay').classList.add('hidden');capture=-1};
let axisLock=false,prevHat=0;
function choose(n){state.selection=Math.max(0,Math.min(3,n));update()}
function press(n){if(capture>=0){mapping.buttons[capture]=n;capture=-1;showMapping();$('capture').textContent='버튼 지정 완료';return;}const command=mapping.buttons.indexOf(n);if(command>=0)action(command);}
window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code))e.preventDefault();if(capture>=0){mapping.keys[capture]=e.code;capture=-1;showMapping();$('capture').textContent='키 지정 완료';return;}if(e.repeat)return;if(!state.started&&(e.code==='Enter'||e.code==='Space')){startGame();return;}if(['ArrowLeft','KeyA'].includes(e.code))choose(state.selection-1);else if(['ArrowRight','KeyD'].includes(e.code))choose(state.selection+1);else if(['ArrowUp','KeyW'].includes(e.code))action(2);else if(['ArrowDown','KeyS'].includes(e.code))action(3);else if(e.code==='Enter'||e.code==='Space')action(state.selection);else {const command=mapping.keys.indexOf(e.code);if(command>=0)action(command)}});
function gamepad(){
  const pads=navigator.getGamepads?.()||[];const pad=[...pads].find(Boolean);$('padstatus').textContent=pad?`GAMEPAD · ${pad.id.slice(0,40)}`:'GAMEPAD · 연결 대기 / 키보드 사용 가능';
  if(!pad){previousButtons=[];return;}
  const pressed=pad.buttons.map(button=>button.pressed);
  if(!state.started&&pressed.some((value,i)=>value&&!previousButtons[i])){previousButtons=pressed;startGame();return;}
  pad.buttons.forEach((button,i)=>{if(button.pressed&&!previousButtons[i])press(i)});previousButtons=pressed;
  let horizontal=pad.axes[0]||0,vertical=pad.axes[1]||0;
  if(pad.buttons[14]?.pressed)horizontal=-1;if(pad.buttons[15]?.pressed)horizontal=1;if(pad.buttons[12]?.pressed)vertical=-1;if(pad.buttons[13]?.pressed)vertical=1;
  const direction=Math.abs(horizontal)>.5?(horizontal>0?1:-1):0;
  if(direction&&!axisLock){choose(state.selection+direction);axisLock=true;}if(!direction)axisLock=false;
  const hat=vertical<-.5?-1:vertical>.5?1:0;if(hat&&hat!==prevHat)action(hat<0?2:3);prevHat=hat;
}
let last=performance.now(),acc=0,nextFlickerAt=14500,flickerUntil=0,flickerIndex=2,lastCctvGlitch=0;
function frame(time){
  requestAnimationFrame(frame);const dt=Math.min((time-last)/1000,.1);last=time;acc+=dt;
  while(acc>=1){acc-=1;if(state.started&&!state.over){state.remaining--;if(state.remaining<=0)finish();update();}}
  gamepad();updateCustomer(dt,time);
  const doorOffset=time<doorOpenUntil?1.32:.67;doorLeft.position.x=THREE.MathUtils.damp(doorLeft.position.x,-doorOffset,8,dt);doorRight.position.x=THREE.MathUtils.damp(doorRight.position.x,doorOffset,8,dt);
  if(state.started&&time>nextFlickerAt){
    const litFixtures=ceilingFixtures.map((light,index)=>light.userData.baseIntensity>.5?index:-1).filter(index=>index>=0);
    flickerIndex=litFixtures[Math.floor(Math.random()*litFixtures.length)];
    flickerUntil=time+100+Math.random()*180;nextFlickerAt=time+14000+Math.random()*11000;
  }
  ceilingFixtures.forEach((light,index)=>{
    const flickering=index===flickerIndex&&time<flickerUntil;
    const base=light.userData.baseIntensity*(flickering?.12:1);
    light.intensity=THREE.MathUtils.damp(light.intensity,base,18,dt);
    light.userData.diffuser.emissiveIntensity=THREE.MathUtils.damp(light.userData.diffuser.emissiveIntensity,flickering?.045:light.userData.baseGlow,18,dt);
  });
  lamp.intensity=(state.torch?19:10)*(time<flickerUntil?.9:1);
  updateScare(dt);
  if(state.cctv){const elapsed=480-state.remaining;$('cctv-time').textContent=`00:${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;if(time-lastCctvGlitch>9200){$('cctv-overlay').classList.add('distort');setTimeout(()=>$('cctv-overlay').classList.remove('distort'),180);lastCctvGlitch=time;}}
  renderer.render(scene,camera);
}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});update();requestAnimationFrame(frame);
