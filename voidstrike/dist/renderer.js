import * as THREE from './vendor/three.module.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const TAU = Math.PI * 2;
const colors = {
  pulse: '#c2ff58', spread: '#ba98ff', ion: '#6cddff', arc: '#ffcf70',
  enemy: '#ff6951', heavy: '#ff9f63', life: '#adffae'
};

function randomSequence(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// A hull is assembled from stamped, beveled armor plates. The same triangles
// power the WebGL models and the cached sprites used by the 2D fallback.
class Hull {
  constructor() {
    this.solid = [];
    this.lit = [];
  }

  triangle(a, b, c, color, light = false) {
    (light ? this.lit : this.solid).push({ a, b, c, color });
  }

  plate(outline, z, height, color, bevel = 0.1, light = false) {
    const points = [...outline];
    const area = points.reduce((sum, p, i) => {
      const q = points[(i + 1) % points.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0);
    if (area < 0) points.reverse();
    const cx = points.reduce((v, p) => v + p[0], 0) / points.length;
    const cy = points.reduce((v, p) => v + p[1], 0) / points.length;
    const rim = points.map(([x, y]) => [x, y, z]);
    const cap = points.map(([x, y]) => [x + (cx - x) * bevel, y + (cy - y) * bevel, z + height]);
    for (let i = 0; i < cap.length; i++) {
      const j = (i + 1) % cap.length;
      this.triangle(rim[i], rim[j], cap[i], color, light);
      this.triangle(rim[j], cap[j], cap[i], color, light);
    }
    const tris = THREE.ShapeUtils.triangulateShape(cap.map(([x, y]) => new THREE.Vector2(x, y)), []);
    for (const [a, b, c] of tris) this.triangle(cap[a], cap[b], cap[c], color, light);
  }

  rect(x, y, w, h, z, depth, color, bevel = 0.08, light = false) {
    this.plate([[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2]], z, depth, color, bevel, light);
  }

  line(x1, y1, x2, y2, width, z, color, light = false) {
    const length = Math.hypot(x2-x1, y2-y1) || 1;
    const dx = (y2-y1) / length * width / 2;
    const dy = (x1-x2) / length * width / 2;
    this.plate([[x1+dx,y1+dy],[x1-dx,y1-dy],[x2-dx,y2-dy],[x2+dx,y2+dy]], z, .004, color, 0, light);
  }

  facet(points, z, lift, peakX, peakY, color) {
    const peak = [peakX, peakY, z+lift];
    const outline = THREE.ShapeUtils.isClockWise(points.map(([x,y]) => new THREE.Vector2(x,y))) ? [...points].reverse() : points;
    for (let i = 0; i < outline.length; i++) this.triangle([...outline[i], z], [...outline[(i+1)%outline.length], z], peak, color);
  }

  mirrored(sign, outline, z, height, color, bevel = .10, light = false) {
    this.plate(outline.map(([x,y]) => [sign*x,y]), z, height, color, bevel, light);
  }
}

const steel = '#52616a', dark = '#263039', rim = '#879394', charcoal = '#161e28';
const ivory = '#dbe2d8', gunmetal = '#43505b', brass = '#bd8058';
const lime = '#bcff4b', amber = '#ff8750', alloy = '#a3afb0';

function playerHull() {
  const h = new Hull();
  h.engines = [[-.32,-.70,.24],[.32,-.70,.24]];
  const keel = [[0,1.18],[.16,.91],[.28,.32],[.31,-.35],[.18,-.76],[-.18,-.76],[-.31,-.35],[-.28,.32],[-.16,.91]];
  h.plate(keel,0,.14,dark,.16);
  for (const s of [-1,1]) {
    const m = (p,z,d,c,b,lit) => h.mirrored(s,p,z,d,c,b,lit);
    // Two spars and an inset shadow make the swept wing read as separate plating.
    m([[.13,.61],[.34,.40],[.55,.02],[.98,-.37],[1.01,-.75],[.77,-.65],[.54,-.53],[.20,-.70]],.015,.105,dark);
    m([[.20,.53],[.32,.39],[.54,-.02],[.93,-.39],[.95,-.57],[.64,-.40],[.39,-.24],[.21,-.32]],.11,.09,ivory);
    m([[.48,-.09],[.62,-.20],[.91,-.43],[.91,-.50],[.60,-.32]],.196,.012,alloy);
    m([[.76,-.30],[.94,-.43],[.95,-.54],[.78,-.43]],.207,.008,lime,.02,true);
    m([[.36,-.29],[.54,-.25],[.76,-.44],[.64,-.55],[.44,-.46]],.12,.045,gunmetal);
    m([[.17,.40],[.26,.45],[.46,.06],[.41,-.02],[.23,.18]],.197,.032,'#f4f6e9');
    // Twin recoil rails, barrel shroud, muzzle and breech.
    h.rect(s*.59,.10,.094,.60,.14,.10,dark);
    h.rect(s*.59,.25,.070,.48,.235,.040,rim);
    h.rect(s*.59,.47,.089,.095,.26,.024,ivory);
    h.rect(s*.59,.49,.045,.056,.283,.008,lime,.03,true);
    h.rect(s*.59,.025,.12,.14,.24,.046,charcoal);
    for (let i=0;i<3;i++) h.rect(s*.59,-.017+i*.037,.093,.013,.288,.006,steel);
    // Engine shoulders and segmented ceramic engine cowl.
    m([[.18,-.12],[.31,.04],[.47,-.14],[.46,-.57],[.39,-.68],[.22,-.65]],.13,.15,steel);
    m([[.25,-.12],[.34,-.04],[.42,-.16],[.39,-.41],[.25,-.43]],.28,.06,ivory,.17);
    h.rect(s*.32,-.56,.218,.18,.22,.065,charcoal);
    for(let i=0;i<3;i++) h.rect(s*.32,-.50-i*.057,.193,.022,.287,.012,rim);
    h.rect(s*.32,-.68,.20,.065,.20,.046,steel);
    h.rect(s*.32,-.713,.15,.035,.24,.007,lime,.05,true);
    m([[.15,.26],[.21,.14],[.18,-.38],[.12,-.53],[.095,-.23]],.35,.035,alloy);
    h.line(s*.11,.76,s*.18,.40,.019,.329,steel);
    h.rect(s*.202,.03,.028,.13,.367,.008,lime,.02,true);
    for (const [x,y] of [[.30,.24],[.34,-.18],[.80,-.41],[.39,-.44]]) h.rect(s*x,y,.029,.028,.351,.006,'#cad2c9');
  }
  h.facet([[0,1.16],[.155,.87],[.20,.43],[.13,.30],[-.13,.30],[-.20,.43],[-.155,.87]],.215,.19,-.03,.68,ivory);
  h.plate([[0,.61],[.158,.35],[.158,.03],[0,-.105],[-.158,.03],[-.158,.35]],.32,.078,charcoal,.12);
  h.facet([[0,.53],[.12,.32],[.106,.085],[0,-.005],[-.108,.085],[-.125,.32]],.393,.088,-.046,.25,'#40636d');
  h.plate([[-.096,.26],[-.012,.45],[.023,.39],[-.049,.20]],.455,.005,'#b1e5dd',0,true);
  h.plate([[-.105,-.105],[.105,-.105],[.129,-.35],[0,-.56],[-.129,-.35]],.25,.094,ivory);
  h.line(0,-.17,0,-.34,.046,.349,lime,true);
  h.scale = .68;
  return h;
}

function enemyHull(type) {
  const h = new Hull();
  const boss = type === 'boss', heavy = boss || type === 'brute', swift = type === 'striker';
  // Each variant has its own wing span, depth, armor and engine layout.
  const span = boss ? 1.37 : heavy ? 1.21 : swift ? 1.05 : .92;
  const metal = heavy ? '#5d5460' : '#6b5d62';
  const armor = boss ? '#a55c51' : swift ? '#c88468' : '#c17968';
  const plate = '#b6a399';
  h.engines = [];
  for (const s of [-1,1]) {
    const m = (p,z,d,c,b,lit) => h.mirrored(s,p.map(([x,y]) => [x*span,y]),z,d,c,b,lit);
    m([[.12,.45],[.41,.69],[.69,.56],[.91,.31],[.96,-.29],[.83,-.62],[.67,-.48],[.58,-.09],[.26,-.16]],.005,.135,charcoal);
    m([[.14,.43],[.39,.58],[.64,.45],[.73,.18],[.59,.10],[.30,.16]],.135,.11,metal);
    m([[.39,.53],[.53,.60],[.82,.34],[.86,.06],[.72,-.12],[.62,.30]],.23,.085,armor);
    m([[.53,.52],[.59,.49],[.74,.31],[.76,.20],[.68,.25]],.309,.014,plate);
    m([[.725,.12],[.86,.28],[.91,-.16],[.82,-.49],[.75,-.27]],.138,.082,gunmetal);
    m([[.79,-.08],[.86,-.01],[.85,-.24],[.80,-.36]],.218,.009,amber,.03,true);
    h.line(s*.25*span,.30,s*.52*span,.33,.022,.27,'#e4ac86');
    h.line(s*.29*span,.03,s*.49*span,.07,.030,.185,amber,true);
    h.rect(s*.41*span,.57,.16,.15,.17,.1,steel);
    h.rect(s*.41*span,.665,.14,.045,.25,.012,amber,.02,true);
    h.engines.push([s*.41*span,.67,.17]);
    // Underslung guns are faceted barrels with a hot aperture.
    h.rect(s*.57*span,-.17,.112,.37,.10,.1,dark);
    h.rect(s*.57*span,-.25,.064,.25,.20,.035,alloy);
    h.rect(s*.57*span,-.385,.095,.048,.21,.024,charcoal);
    h.rect(s*.57*span,-.41,.044,.026,.229,.006,amber,.02,true);
    if (swift) {
      m([[.77,.25],[1.05,.54],[1.20,.48],[1.08,-.48],[.96,-.72],[.94,-.05]],.03,.14,dark);
      m([[.85,.24],[1.09,.42],[1.13,.39],[1.02,-.36],[.97,-.51],[.99,.09]],.174,.086,armor);
    }
    if (heavy) {
      m([[.62,.26],[.86,.49],[1.09,.43],[1.18,.08],[1.13,-.32],[.99,-.54],[.88,-.41],[.92,-.03]],.06,.19,metal);
      m([[.88,.40],[1.01,.36],[1.10,.13],[1.13,-.10],[1.01,-.29],[.96,-.21]],.245,.09,armor);
      for(let i=0;i<4;i++) h.line(s*(.95+i*.028)*span,.18-i*.078,s*(1.07+i*.008)*span,.135-i*.078,.025,.339,'#4e4e53');
      h.rect(s*1.01*span,-.38,.14,.33,.13,.14,dark);
      h.rect(s*1.01*span,-.47,.082,.22,.275,.014,rim);
      if(boss) {
        m([[.75,.44],[.97,.73],[1.12,.61],[1.30,.23],[1.31,-.05],[1.14,.13]],.02,.12,gunmetal);
        h.engines.push([s*.97*span,.58,.22]);
      }
    }
  }
  h.plate([[0,-.74],[.225,-.43],[.29,.13],[.215,.52],[0,.69],[-.215,.52],[-.29,.13],[-.225,-.43]],.16,.15,metal);
  h.facet([[0,-.68],[.18,-.39],[.205,-.12],[.12,-.03],[-.12,-.03],[-.205,-.12],[-.18,-.39]],.31,.13,-.04,-.31,plate);
  h.plate([[-.19,.26],[-.14,.04],[0,-.055],[.14,.04],[.19,.26],[0,.40]],.302,.075,charcoal);
  h.facet([[-.14,.22],[-.09,.07],[0,.014],[.09,.07],[.14,.22],[0,.32]],.385,.08,-.035,.16,'#864841');
  h.line(-.123,.12,-.018,.063,.034,.437,amber,true);
  h.line(.018,.063,.123,.12,.034,.437,amber,true);
  for(let i=0;i<3;i++) h.rect(0,.415+i*.054,.185-i*.03,.023,.323,.011,steel);
  if(boss) {
    const ring = (radius, cy, n) => Array.from({length:n},(_,i)=>[radius*Math.cos(TAU*i/n),cy+radius*Math.sin(TAU*i/n)]);
    h.plate([[-.63,.55],[-.33,.77],[.33,.77],[.63,.55],[.62,.29],[.29,-.19],[-.29,-.19],[-.62,.29]],.29,.15,dark);
    for(const s of [-1,1]) {
      const m=(points,z,height,color)=>h.mirrored(s,points,z,height,color);
      m([[.23,.68],[.44,.65],[.66,.47],[.59,.30],[.40,.37],[.27,.47]],.44,.09,armor);
      m([[.25,.01],[.51,.25],[.64,.12],[.51,-.27],[.27,-.48]],.31,.13,plate);
      m([[.31,-.10],[.52,.095],[.48,-.14],[.32,-.31]],.44,.022,'#635257');
      h.rect(s*1.02,-.19,.23,.92,.23,.14,charcoal);
      h.rect(s*1.02,-.34,.162,.64,.37,.065,gunmetal);
      h.rect(s*1.02,-.66,.204,.095,.385,.048,brass);
      h.rect(s*1.02,-.704,.10,.036,.431,.011,'#ff5637',.04,true);
      for(let i=0;i<4;i++) h.rect(s*1.02,-.03-i*.088,.17,.028,.435,.01,alloy);
    }
    h.plate(ring(.285,.28,12),.44,.10,brass);
    h.plate(ring(.23,.28,12),.542,.018,charcoal,.02);
    h.plate(ring(.145,.28,8),.56,.055,'#c16939');
    h.plate(ring(.075,.28,6),.616,.006,'#ffe6a2',.04,true);
    for(let i=0;i<8;i++){
      const a=i*TAU/8;
      h.line(.178*Math.cos(a),.28+.178*Math.sin(a),.229*Math.cos(a),.28+.229*Math.sin(a),.033,.563,amber,true);
    }
  }
  h.scale = boss ? 1.08 : type === 'brute' ? .69 : swift ? .53 : .51;
  return h;
}

function pickupHull(kind) {
  const h = new Hull();
  const life = kind === 'life', color = colors[kind];
  const outline = life
    ? [[0,.37],[.34,.16],[.34,-.16],[0,-.37],[-.34,-.16],[-.34,.16]]
    : [[0,.48],[.38,.27],[.38,-.27],[0,-.45],[-.38,-.27],[-.38,.27]];
  const inset = factor => outline.map(([x,y]) => [x*factor,y*factor]);
  h.plate(outline,0,.07,'#24313b',.06);
  h.plate(inset(.97),.07,.035,color,.02,true);
  h.plate(inset(.84),.105,.04,'#14272e',.03);
  if (life) {
    h.plate([[0,.22],[.058,.068],[.20,-.096],[.20,-.17],[.058,-.11],
      [0,-.17],[-.058,-.11],[-.20,-.17],[-.20,-.096],[-.058,.068]],
      .15,.01,color,0,true);
  } else if (kind === 'spread') {
    for (const side of [-1,0,1]) {
      h.line(side*.083,-.145,side*.223,.16,.065,.15,color,true);
    }
  } else if (kind === 'arc') {
    h.plate([[.055,.26],[-.18,-.025],[-.025,-.025],[-.092,-.25],
      [.194,.105],[.042,.105]],.15,.012,color,0,true);
  } else {
    h.plate([[-.16,-.22],[.006,.13],[.18,.235],[.103,.042]],.15,.012,color,0,true);
    h.line(-.206,-.126,-.111,.045,.027,.15,color,true);
    h.line(.028,-.175,.12,-.028,.027,.15,color,true);
  }
  h.scale=1; h.engines=[];
  return h;
}

function hullGeometry(triangles) {
  const positions = [], normals = [], colors = [];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), normal = new THREE.Vector3(), tint = new THREE.Color();
  for(const {a,b,c,color} of triangles) {
    e1.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    e2.set(c[0]-a[0],c[1]-a[1],c[2]-a[2]);
    normal.crossVectors(e1,e2).normalize();
    tint.set(color);
    for(const p of [a,b,c]) {
      positions.push(...p);
      normals.push(normal.x,normal.y,normal.z);
      colors.push(tint.r,tint.g,tint.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  return geometry;
}

function shipBatch(scene, model, solid, accent) {
  const meshes = [model.solid, model.lit].map((triangles, i) => {
    const mesh = new THREE.InstancedMesh(hullGeometry(triangles), i ? accent : solid, 64);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  });
  const transform = new THREE.Object3D(), tint = new THREE.Color();
  return {
    reset() { meshes.forEach(mesh => { mesh.count=0; }); },
    add(x,y,roll,yaw,flash,scale = 1) {
      const index=meshes[0].count;
      if(index >= 64) return;
      transform.position.set(x,y,0);
      transform.rotation.set(-.10,roll,yaw,'ZXY');
      transform.scale.setScalar(model.scale*scale);
      transform.updateMatrix();
      tint.setRGB(1+flash*.95,1+flash*.58,1+flash*.38);
      for(const mesh of meshes) {
        mesh.count++;
        mesh.setMatrixAt(index,transform.matrix);
        mesh.setColorAt(index,tint);
      }
    },
    finish() {
      for(const mesh of meshes) {
        mesh.visible=mesh.count>0;
        if(!mesh.count) continue;
        mesh.instanceMatrix.needsUpdate=true;
        mesh.instanceColor.needsUpdate=true;
      }
    },
    dispose() {
      for(const mesh of meshes) { mesh.geometry.dispose(); mesh.dispose(); }
    }
  };
}

// Soft light, hot cores, sparks, jet plumes and shock waves share one buffered
// draw call. Geometry is updated only through the last live quad.
function particleBatch(scene) {
  const limit=4096, vertices=limit*4;
  const positions=new Float32Array(vertices*3), texCoords=new Float32Array(vertices*2);
  const tints=new Float32Array(vertices*4), shapes=new Float32Array(vertices);
  const indices=new Uint16Array(limit*6);
  for(let i=0;i<limit;i++){
    texCoords.set([-1,-1,1,-1,1,1,-1,1],i*8);
    const v=i*4;
    indices.set([v,v+1,v+2,v,v+2,v+3],i*6);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv',new THREE.BufferAttribute(texCoords,2));
  g.setAttribute('tint',new THREE.BufferAttribute(tints,4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('shape',new THREE.BufferAttribute(shapes,1).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(new THREE.BufferAttribute(indices,1));
  const material=new THREE.ShaderMaterial({
    transparent:true,depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`
      attribute vec4 tint; attribute float shape;
      varying vec4 vTint; varying vec2 vUv; varying float vShape;
      void main(){vUv=uv;vTint=tint;vShape=shape;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
    `,
    fragmentShader:`
      varying vec4 vTint; varying vec2 vUv; varying float vShape;
      void main(){
        vec2 p=vUv; float r=length(p),a=0.,hot=0.;
        if(vShape<.5){ a=exp(-4.8*r*r)*(1.-smoothstep(.64,1.,r)); }
        else if(vShape<1.5){
          float d=length(vec2(p.x,max(abs(p.y)*2.8-1.8,0.)));
          a=(1.-smoothstep(.0,.94,d))*(1.-smoothstep(.77,1.,abs(p.y))*.38);
          hot=1.-smoothstep(.0,.29,d);
        }else if(vShape<2.5){
          float t=(p.y+1.)*.5;
          float q=abs(p.x)/max(.035,mix(.045,.78,t));
          a=pow(t,.62)*exp(-q*q*2.3)*(1.-smoothstep(.91,1.,t));
          hot=a*.95;
        }else if(vShape<3.5){
          a=exp(-pow((r-.79)/.065,2.))*(1.-smoothstep(.96,1.,r));
        }else if(vShape<4.5){
          a=pow(max(0.,1.-abs(p.x)-abs(p.y)),.65);hot=a*.7;
        }else {
          a=max(0.,1.-r)*.12+exp(-abs(p.x)*26.)*pow(max(0.,1.-abs(p.y)),2.)
                    +exp(-abs(p.y)*26.)*pow(max(0.,1.-abs(p.x)),2.);
          hot=clamp(a*.65,0.,1.);
        }
        float alpha=a*vTint.a;if(alpha<.009) discard;
        gl_FragColor=vec4(mix(vTint.rgb,vec3(1.),min(.91,hot)),alpha);
        #include <colorspace_fragment>
      }
    `
  });
  const mesh=new THREE.Mesh(g,material); mesh.frustumCulled=false; mesh.renderOrder=8; scene.add(mesh);
  const palette=new Map(); let count=0;
  function quad(x,y,width,height,rotation,color,opacity,shape=0,z=.80) {
    if(count>=limit || opacity<=0 || width<=0 || height<=0) return;
    let c=palette.get(color);
    if(!c){c=new THREE.Color(color);palette.set(color,c);}
    const v=count*4, sx=Math.cos(rotation)*width*.5, sy=Math.sin(rotation)*width*.5;
    const ux=-Math.sin(rotation)*height*.5, uy=Math.cos(rotation)*height*.5;
    const p=v*3;
    positions[p]=x-sx-ux; positions[p+1]=y-sy-uy;
    positions[p+3]=x+sx-ux; positions[p+4]=y+sy-uy;
    positions[p+6]=x+sx+ux; positions[p+7]=y+sy+uy;
    positions[p+9]=x-sx+ux; positions[p+10]=y-sy+uy;
    for(let i=0;i<4;i++){
      positions[p+i*3+2]=z;
      const k=(v+i)*4;
      tints[k]=c.r; tints[k+1]=c.g; tints[k+2]=c.b; tints[k+3]=opacity;
      shapes[v+i]=shape;
    }
    count++;
  }
  return {
    quad,
    reset(){count=0;},
    finish(){
      g.setDrawRange(0,count*6);
      for(const key of ['position','tint','shape']){
        const attr=g.getAttribute(key); attr.clearUpdateRanges(); attr.addUpdateRange(0,count*4*attr.itemSize); attr.needsUpdate=true;
      }
    },
    dispose(){g.dispose();material.dispose();}
  };
}

function starField(scene) {
  const random=randomSequence(509);
  const positions=[],brightness=[],speed=[];
  for(let i=0;i<110;i++) {
    positions.push((random()-.5)*10,random()*16,-3);
    brightness.push(.22+random()*.70); speed.push(.11+random()*.48);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('brightness',new THREE.Float32BufferAttribute(brightness,1));
  g.setAttribute('speed',new THREE.Float32BufferAttribute(speed,1));
  const m=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{clock:{value:0},dpr:{value:1}},
    vertexShader:`uniform float clock,dpr; attribute float brightness,speed; varying float vAlpha;
      void main(){vec3 p=position;p.y=mod(p.y-clock*speed,16.)-.5;
      vAlpha=brightness*(.69+.31*sin(position.x*2.+clock*.85));
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=(.6+brightness*1.3)*dpr;}`,
    fragmentShader:`varying float vAlpha; void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.77,.85,.87,(1.-smoothstep(.14,1.,r))*vAlpha);}`
  });
  const field=new THREE.Points(g,m);field.frustumCulled=false;field.renderOrder=-5;scene.add(field);
  return {
    resize(sx,sy){field.scale.set(sx,sy,1);},
    update(time,dpr){m.uniforms.clock.value=time;m.uniforms.dpr.value=dpr;},
    dispose(){g.dispose();m.dispose();}
  };
}

// The belt's near-field fragments use low-luminance mineral facets and drift
// at different speeds from the distant stars.
function debrisField(scene) {
  const random=randomSequence(201);
  const material=new THREE.MeshPhongMaterial({vertexColors:true,specular:0x242625,shininess:13});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vStone;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvStone=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vStone;
      float grit(vec3 p){
        p=fract(p*.3183099+vec3(.11,.19,.07))*17.;
        return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
      }
      float grain(vec3 p){
        vec3 a=floor(p), b=fract(p); b=b*b*(3.-2.*b);
        return mix(mix(mix(grit(a),grit(a+vec3(1,0,0)),b.x),
                       mix(grit(a+vec3(0,1,0)),grit(a+vec3(1,1,0)),b.x),b.y),
                   mix(mix(grit(a+vec3(0,0,1)),grit(a+vec3(1,0,1)),b.x),
                       mix(grit(a+vec3(0,1,1)),grit(a+vec3(1,1,1)),b.x),b.y),b.z);
      }`).replace('#include <color_fragment>',`#include <color_fragment>
        float vein=grain(vStone*4.1+grain(vStone*7.5));
        float ripples=smoothstep(.1,.64,abs(sin(vStone.y*19.+vein*9.4)));
        diffuseColor.rgb*=.26+.64*vein+.76*grain(vStone*27.)+.32*ripples;
      `);
  };
  const rocks=[];
  for(let i=0;i<10;i++){
    const geometry=new THREE.IcosahedronGeometry(1,2);
    const coords=geometry.getAttribute('position');
    const colorsArray=[],color=new THREE.Color();
    const seed=random()*10;
    for(let k=0;k<coords.count;k+=3){
      color.setHSL(.055+random()*.03,.13+random()*.11,.039+random()*.038);
      for(let j=0;j<3;j++) {
        const p=k+j,x=coords.getX(p),y=coords.getY(p),z=coords.getZ(p);
        const variation=.90+.17*Math.sin(x*6.3+y*4.9+z*8.1+seed);
        coords.setXYZ(p,x*variation*1.18,y*variation*.81,z*variation*.91);
        colorsArray.push(color.r,color.g,color.b);
      }
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colorsArray,3));
    geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material), size=i<3?.20+random()*.20:.048+random()*.075;
    mesh.scale.setScalar(size);mesh.position.z=-1.6;
    scene.add(mesh);
    const x=(i<3?(i%2?-1:1)*(4.2+random()*.75):(random()-.5)*9.8);
    rocks.push({mesh,x,y:random()*17,v:.095+size*.5,w:.1+random()*.17});
  }
  return {
    update(t,sx,sy){
      for(const rock of rocks){
        rock.mesh.position.x=(rock.x+Math.sin(t*.05+rock.y)*.23)*sx;
        rock.mesh.position.y=(((rock.y-t*rock.v)%17+17)%17-1)*sy;
        rock.mesh.rotation.set(t*rock.w+rock.x,t*.10+rock.y,t*.045+rock.x);
      }
    },
    dispose(){rocks.forEach(r=>r.mesh.geometry.dispose());material.dispose();}
  };
}

function segment(draw,x1,y1,x2,y2,width,color,alpha,shape=1) {
  const dx=x2-x1,dy=y2-y1;
  draw((x1+x2)/2,(y1+y2)/2,width,Math.hypot(dx,dy)+width*.35,Math.atan2(-dx,dy),color,alpha,shape);
}

function shotFX(draw,s,time,sx,sy) {
  const kind=s.kind,tint=colors[kind]||colors.pulse,angle=Math.atan2(-s.vx*sx,s.vy*sy)||0;
  const x=s.x*sx,y=s.y*sy;
  if(kind==='enemy'||kind==='heavy'){
    const size=kind==='heavy'?.32:.19;
    draw(x,y,size*2.8,size*2.8,0,tint,.35);
    draw(x,y,size*1.35,size*(kind==='heavy'?1.5:2.05),angle,tint,.96,1);
    if(kind==='heavy') draw(x,y,size*1.43,size*1.43,0,tint,.75,3);
  }else{
    const length=kind==='ion'?.80:kind==='arc'?.40:kind==='spread'?.36:.51;
    const width=kind==='ion'?.12:kind==='spread'?.078:.088;
    draw(x,y,width*3.3,length*1.16,angle,tint,.46);
    draw(x,y,width,length,angle,tint,.98,1);
    if(kind==='arc') draw(x,y,.31,.35,time*7,tint,.73,5);
  }
}

function engineFX(draw,x,y,model,type,bank,t,charge) {
  const player=type==='player', scale=model.scale;
  for(let i=0;i<model.engines.length;i++){
    const [px,py,width]=model.engines[i];
    const ex=x+px*scale*Math.cos(bank*.42)-py*scale*bank*.055,ey=y+py*scale+px*scale*bank*.055;
    const length=(player?.65:.34)*scale*(1+.11*Math.sin(t*24+i*3));
    const tint=player?colors.pulse:colors.enemy;
    draw(ex,ey+(player?-1:1)*length*.38,width*scale*3.1,length*1.75,0,tint,player?.40:.22,0,-.10);
    draw(ex,ey+(player?-1:1)*length*.44,width*scale*1.35,length,player?0:Math.PI,tint,.95,2,-.08);
    draw(ex,ey,width*scale*1.48,width*scale*.84,0,tint,.95,1);
  }
  if(!player && charge>.01){
    const size=.22+charge*.39, cy=y-.48*scale;
    draw(x,cy,size,size,0,colors.enemy,charge*.63);
    draw(x,cy,size*.72,size*.72,t*.5,colors.heavy,charge,5);
  }
}

const weaponPorts = {
  pulse: [[-.40,.35],[.40,.35]],
  spread: [[-.28,.29],[.28,.29]],
  ion: [[0,.70]],
  arc: [[-.53,-.04],[.53,-.04]]
};

function weaponFX(draw, player, time, centerX, centerY) {
  const bank = player.bank || 0;
  for (const kind of player.weapons) {
    const firedAt = player.lastShotAt[kind] ?? -Infinity;
    const flash = Math.max(0, 1 - (time - firedAt) / .105);
    if (kind === 'pulse' && !flash) continue;
    const tint = colors[kind];
    for (const [px, py] of weaponPorts[kind]) {
      const x = centerX + px * Math.cos(bank * .42) - py * bank * .055;
      const y = centerY + py + px * bank * .055;
      if (kind !== 'pulse') draw(x, y, .095, .15, bank * .055, tint, .85, 1);
      if (flash) draw(x, y + .045, .26, .38, 0, tint, flash * .82, 5);
    }
  }
}

function effectFX(draw,e,sx,sy) {
  const progress=clamp(e.age/(e.duration||.4),0,1),fade=1-progress;
  let seed=Number(e.id);
  if(!Number.isFinite(seed)) {
    seed=0;
    for(const c of String(e.id)) seed=(seed*31+c.charCodeAt(0))|0;
  }
  const time=e.age, x=e.x*sx, y=e.y*sy, size=e.size||1;
  if(e.kind==='arc'){
    if(!Number.isFinite(e.x2)||!Number.isFinite(e.y2))return;
    const dx=e.x2*sx-x,dy=e.y2*sy-y,len=Math.hypot(dx,dy)||1;
    const count=clamp(Math.ceil(len/.35),3,18);
    let ax=x,ay=y;
    for(let i=1;i<=count;i++){
      const t=i/count;
      const jitter=i===count?0:Math.sin(i*5.73+seed+Math.floor(time*28))*.10;
      const bx=x+dx*t+dy/len*jitter,by=y+dy*t-dx/len*jitter;
      segment(draw,ax,ay,bx,by,.15,colors.arc,.31*fade,0);
      segment(draw,ax,ay,bx,by,.052,colors.arc,.95*fade);
      ax=bx;ay=by;
    }
    return;
  }
  const collect=e.kind==='collect',burst=e.kind==='burst',hit=e.kind==='hit';
  const tint=collect?(colors[e.item]||colors.pulse):burst?colors.ion:'#ff9752';
  const radius=(burst?6.8:hit?.32:collect?.75:1.05)*size;
  draw(x,y,radius*(.58+progress),radius*(.58+progress),0,tint,fade*fade*.71);
  if(!hit) draw(x,y,radius*(.30+progress*2.1),radius*(.30+progress*2.1),0,tint,.65*fade*fade,3);
  draw(x,y,radius*.84*fade,radius*.84*fade,0,'#fff1be',.85*fade,5);
  const count=hit?5:collect?9:burst?30:18;
  for(let i=0;i<count;i++){
    const jitter=Math.sin((i+1)*12.9898+seed*78.233)*43758.5453;
    const random=jitter-Math.floor(jitter);
    const angle=(i/count)*TAU+random*.42+seed*.3;
    const d=(1-Math.pow(fade,1.64))*radius*(.29+.79*random);
    const fx=x+Math.sin(angle)*d,fy=y+Math.cos(angle)*d;
    draw(fx,fy,(.04+random*.046)*size*fade,(.085+random*.18)*size*fade,-angle,i%3===0?'#ffdfa1':tint,fade,4);
  }
}

function compose(state,models,ship,draw,sx,sy) {
  const t=state.time;
  for(const e of state.enemies){
    const m=models[e.type]; if(!m) continue;
    const bank=e.bank||0,x=e.x*sx,y=e.y*sy;
    engineFX(draw,x,y,m,e.type,bank,t,e.charge||0);
    ship(e.type,x,y,bank*.28,bank*.055,e.flash||0);
    if(e.type==='striker' && e.locked){
      const muzzleY=y-.35,dx=e.aimX*sx-x,dy=e.aimY*sy-muzzleY;
      const distance=Math.hypot(dx,dy);
      if(distance>.2){
        const reach=Math.min(distance,.43+e.charge*.72)/distance;
        segment(draw,x,muzzleY,x+dx*reach,muzzleY+dy*reach,.045,colors.enemy,.28+e.charge*.5);
      }
    }
    if(e.type==='boss' && e.locked && e.pattern==='lock'){
      const opacity=(.28+e.charge*.44),radius=.58-e.charge*.21;
      const aimX=e.aimX*sx,aimY=e.aimY*sy;
      draw(aimX,aimY,radius*2,radius*2,0,colors.enemy,opacity,3);
      for(let i=0;i<4;i++){
        const a=i*TAU/4;
        const dx=Math.sin(a),dy=Math.cos(a);
        segment(draw,aimX+dx*radius*.69,aimY+dy*radius*.69,aimX+dx*radius*1.13,aimY+dy*radius*1.13,.038,colors.enemy,opacity);
      }
    }
  }
  for(const p of state.pickups){
    const key='pickup-'+p.kind;
    if(!models[key]) continue;
    const color=colors[p.kind],x=p.x*sx,y=p.y*sy;
    const pulse=(1+Math.sin(t*3.9+(p.phase||0)))*.5;
    draw(x,y,1.46+pulse*.13,1.57+pulse*.13,0,color,.38,0,-.15);
    if (p.kind==='life') draw(x,y,1.0,1.0,0,color,.43,3,-.09);
    ship(key,x,y,Math.sin(t*2.1+p.x)*.13,Math.sin(t*.9)*.035,0);
  }
  const p=state.player;
  if(p && state.mode!=='lost'){
    const bank=p.bank||0,x=p.x*sx,y=p.y*sy;
    engineFX(draw,x,y,models.player,'player',bank,t,0);
    ship('player',x,y,bank*.42,bank*.055,p.invulnerable>0?(.28+.21*Math.sin(t*27)):0);
    weaponFX(draw,p,t,x,y);
    if(p.invulnerable>0){
      const alpha=clamp(p.invulnerable*2,0,1)*(.38+.19*Math.sin(t*22));
      draw(x,y,1.75,1.83,0,'#a9e9ff',alpha,3);
      // Longer protection belongs to a newly spawned fighter. Its homing ring
      // collapses toward the hull while the ordinary protection ring stays put.
      const arrival = clamp(p.invulnerable - .65, 0, 1);
      if (arrival) {
        const size = 1.85 + arrival * 1.15;
        draw(x,y,size,size,0,colors.life,.46*arrival,3);
      }
    }
  }
  for(const s of state.shots) shotFX(draw,s,t,sx,sy);
  for(const e of state.effects) effectFX(draw,e,sx,sy);
}

function makeModels() {
  const models={player:playerHull()};
  for(const type of ['scout','striker','brute','boss']) models[type]=enemyHull(type);
  for(const kind of ['spread','ion','arc','life']) models['pickup-'+kind]=pickupHull(kind);
  return models;
}

function attachCanvas(mount,canvas) {
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
  canvas.setAttribute('aria-hidden','true');
  mount.appendChild(canvas);
}

function trackDisplay(mount, resize, onViewScale) {
  const touch = window.matchMedia('(pointer: coarse)');
  let dirty = true, lastDpr = 0, lastTime = -Infinity, lastMode;
  const view = {sx:1, sy:1};
  const invalidate = () => { dirty = true; };
  const observer = new ResizeObserver(invalidate);
  observer.observe(mount);
  touch.addEventListener('change', invalidate);

  return {
    invalidate, view,
    prepare(state) {
      const dpr = window.devicePixelRatio || 1;
      const changed = dirty || dpr !== lastDpr;
      if (changed) {
        const width = mount.clientWidth, height = mount.clientHeight;
        if (!width || !height) return false;
        // Preserve fine detail on small phones while bounding the pixel cost
        // of blended effects on large Retina tablets.
        const limit = touch.matches ? Math.max(1, Math.sqrt(1000000 / (width * height))) : 2;
        // Centers span the whole normalized flight area after rotation. Local
        // hulls and hitboxes keep the same size in every screen direction.
        const unit = Math.min(width / 10, height / 15);
        view.sx = (width / 10) / unit;
        view.sy = (height / 15) / unit;
        resize(width, height, Math.min(dpr, limit, 2), view);
        onViewScale?.(view.sx, view.sy);
        lastDpr = dpr;
        dirty = false;
      }
      if (!changed && state.mode === lastMode) {
        if (state.time === lastTime) return false;
        if (touch.matches && state.mode !== 'playing' && state.time > lastTime &&
            state.time - lastTime < 1 / 30 - 0.0005) return false;
      }
      lastMode = state.mode;
      lastTime = state.time;
      return true;
    },
    dispose() {
      observer.disconnect();
      touch.removeEventListener('change', invalidate);
    }
  };
}

function webGLRenderer(mount,models,onViewScale) {
  const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(), camera=new THREE.OrthographicCamera(-5,5,15,0,.1,70);
  camera.position.z=22;
  const hemi=new THREE.HemisphereLight(0xe6f0ff,0x827b81,1.27);
  const key=new THREE.DirectionalLight(0xffecd0,2.05);
  key.position.set(-4,5,6);
  const rimLight=new THREE.DirectionalLight(0x9ebed1,.86);
  rimLight.position.set(3,-2,2);
  scene.add(hemi,key,rimLight);
  const solid=new THREE.MeshPhongMaterial({vertexColors:true,specular:0x4a514f,shininess:29});
  const accent=new THREE.MeshBasicMaterial({vertexColors:true});
  const batches = Object.fromEntries(Object.entries(models).map(([k,m])=>[k,shipBatch(scene,m,solid,accent)]));
  const batchList=Object.values(batches),fx=particleBatch(scene),stars=starField(scene),debris=debrisField(scene);
  const canvas = renderer.domElement;
  attachCanvas(mount,canvas);
  const display = trackDisplay(mount, (width,height,ratio,{sx,sy}) => {
    renderer.setDrawingBufferSize(width,height,ratio);
    camera.left=-5*sx; camera.right=5*sx; camera.top=15*sy;
    camera.updateProjectionMatrix();
    stars.resize(sx,sy);
  }, onViewScale);
  const ship=(type,x,y,roll,yaw,flash) => batches[type].add(x,y,roll,yaw,flash);
  let lost = false, fallback = null;
  function contextLost(event) {
    event.preventDefault();
    lost = true;
  }
  function contextRestored() {
    lost = false;
    fallback?.dispose();
    fallback = null;
    display.invalidate();
  }
  canvas.addEventListener('webglcontextlost',contextLost);
  canvas.addEventListener('webglcontextrestored',contextRestored);
  return {
    render(state){
      if (lost) {
        fallback ??= flatRenderer(mount,models,onViewScale);
        fallback.render(state);
        return;
      }
      if (!display.prepare(state)) return;
      const {sx,sy}=display.view;
      stars.update(state.time,renderer.getPixelRatio());debris.update(state.time,sx,sy);
      for(const batch of batchList)batch.reset();
      fx.reset();
      compose(state,models,ship,fx.quad,sx,sy);
      for(const batch of batchList)batch.finish();
      fx.finish();
      renderer.render(scene,camera);
    },
    dispose(){
      canvas.removeEventListener('webglcontextlost',contextLost);
      canvas.removeEventListener('webglcontextrestored',contextRestored);
      fallback?.dispose();
      display.dispose();
      for(const batch of batchList)batch.dispose();
      fx.dispose();stars.dispose();debris.dispose();solid.dispose();accent.dispose();
      renderer.dispose();renderer.domElement.remove();
    }
  };
}

function spriteFor(model) {
  const sheet=document.createElement('canvas'),pixels=256;
  sheet.width=sheet.height=pixels;
  const c=sheet.getContext('2d');
  const all=[...model.solid.map(face=>({face,lit:false})),...model.lit.map(face=>({face,lit:true}))];
  const extent=Math.max(...all.map(({face:{a,b,c}})=>Math.max(...[a,b,c].map(p=>Math.max(Math.abs(p[0]),Math.abs(p[1])+p[2]*.14)))))*1.09;
  const scale=pixels/(extent*2), normal=new THREE.Vector3(),e1=new THREE.Vector3(),e2=new THREE.Vector3(),color=new THREE.Color();
  c.translate(pixels/2,pixels/2);c.scale(scale,-scale);
  all.sort((a,b)=>(a.face.a[2]+a.face.b[2]+a.face.c[2])-(b.face.a[2]+b.face.b[2]+b.face.c[2]));
  const sun=new THREE.Vector3(-.51,.55,.66).normalize();
  for(const {face,lit} of all) {
    const {a,b,c:p}=face;
    e1.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]);e2.set(p[0]-a[0],p[1]-a[1],p[2]-a[2]);normal.crossVectors(e1,e2).normalize();
    if(normal.z < -.09) continue;
    color.set(face.color);
    if(!lit) color.multiplyScalar(.43+Math.max(0,normal.dot(sun))*.91);
    c.fillStyle=c.strokeStyle=color.getStyle();
    c.lineWidth=.35/scale;
    c.beginPath();
    c.moveTo(a[0],a[1]+a[2]*.1);c.lineTo(b[0],b[1]+b[2]*.1);c.lineTo(p[0],p[1]+p[2]*.1);
    c.closePath();c.fill();c.stroke();
  }
  return {sheet,extent:extent*model.scale};
}

function flatRenderer(mount,models,onViewScale) {
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{alpha:true});
  attachCanvas(mount,canvas);
  const sprites=Object.fromEntries(Object.entries(models).map(([k,m])=>[k,spriteFor(m)]));
  const random=randomSequence(509);
  const stars=Array.from({length:75},()=>({x:(random()-.5)*10,y:random()*16,v:.11+random()*.48,a:.22+random()*.64}));
  const glows=new Map();
  function glow(color){
    if(glows.has(color)) return glows.get(color);
    const s=document.createElement('canvas');s.width=s.height=64;
    const c=s.getContext('2d'),grad=c.createRadialGradient(32,32,0,32,32,32);
    grad.addColorStop(0,color+'ff');grad.addColorStop(.34,color+'96');grad.addColorStop(1,color+'00');
    c.fillStyle=grad;c.fillRect(0,0,64,64);glows.set(color,s);return s;
  }
  function draw(x,y,width,height,angle,color,opacity,shape=0){
    if(width<=0||height<=0||opacity<=0)return;
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(width/2,height/2);
    ctx.globalAlpha=clamp(opacity,0,1);ctx.globalCompositeOperation='lighter';
    ctx.fillStyle=ctx.strokeStyle=color;
    if(shape===0) ctx.drawImage(glow(color),-1,-1,2,2);
    else if(shape===3) {ctx.lineWidth=.077;ctx.beginPath();ctx.arc(0,0,.81,0,TAU);ctx.stroke();}
    else if(shape===2) {
      ctx.beginPath();ctx.moveTo(-.65,.83);ctx.lineTo(.65,.83);ctx.lineTo(0,-1);ctx.closePath();ctx.fill();
      ctx.globalAlpha*=.8;ctx.fillStyle='#fbffdc';ctx.beginPath();ctx.moveTo(-.26,.89);ctx.lineTo(.26,.89);ctx.lineTo(0,-.16);ctx.closePath();ctx.fill();
    }else if(shape===4||shape===5){
      ctx.beginPath();ctx.moveTo(0,1);ctx.lineTo(.17,.16);ctx.lineTo(1,0);ctx.lineTo(.16,-.16);
      ctx.lineTo(0,-1);ctx.lineTo(-.16,-.16);ctx.lineTo(-1,0);ctx.lineTo(-.16,.16);ctx.closePath();ctx.fill();
    }else{
      ctx.beginPath();ctx.ellipse(0,0,.86,.98,0,0,TAU);ctx.fill();ctx.fillStyle='#fffbea';
      ctx.beginPath();ctx.ellipse(0,0,.30,.73,0,0,TAU);ctx.fill();
    }
    ctx.restore();
  }
  function ship(type,x,y,roll,yaw,flash){
    const {sheet,extent}=sprites[type];
    ctx.save();ctx.translate(x,y);ctx.rotate(yaw);ctx.scale(Math.cos(roll),-1);
    ctx.drawImage(sheet,-extent,-extent,2*extent,2*extent);
    if(flash>.1){ctx.globalAlpha=.12+flash*.27;ctx.globalCompositeOperation='lighter';ctx.drawImage(sheet,-extent,-extent,2*extent,2*extent);}
    ctx.restore();
  }
  const display = trackDisplay(mount, (width,height,ratio) => {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }, onViewScale);
  canvas.addEventListener('contextrestored',display.invalidate);
  return {
    render(state){
      if (!display.prepare(state)) return;
      const { width, height } = canvas;
      const {sx,sy}=display.view, unit=width/(10*sx);
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);
      ctx.setTransform(unit,0,0,-unit,width/2,height);
      ctx.fillStyle='#d6e1e5';
      for(const s of stars) {
        ctx.globalAlpha=s.a;const y=((s.y-state.time*s.v)%16+16)%16-.5;
        ctx.fillRect(s.x*sx,y*sy,.018,.024);
      }
      ctx.globalAlpha=1;
      compose(state,models,ship,draw,sx,sy);
    },
    dispose(){
      canvas.removeEventListener('contextrestored',display.invalidate);
      display.dispose();canvas.remove();glows.clear();
    }
  };
}

export function createRenderer(mount,onViewScale) {
  const models=makeModels();
  try {
    return webGLRenderer(mount,models,onViewScale);
  } catch(error) {
    console.warn('Using the 2D flight display because WebGL is unavailable.',error);
    return flatRenderer(mount,models,onViewScale);
  }
}
