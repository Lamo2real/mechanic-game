/* CHASSIS Game — Three.js 3D Garage Scene */
/* Requires THREE.js r128 from CDN */

const Scene3D = (() => {
  let scene, camera, renderer, clock;
  let controls; // simple orbit
  let garageGroup, carGroup;
  let engineMesh, turboMesh, chassisMesh;
  let animFrameId;
  let isDriving = false;
  let driveVelocity = 0;
  let driveRPM = 1200;
  let driveGear = 1;

  // Lights
  let ambientLight, keyLight, fillLight, rimLight, pointLights = [];

  // ── Init
  function init(canvas) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04050a);
    scene.fog = new THREE.FogExp2(0x04050a, 0.035);

    // Camera
    camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.05, 200);
    camera.position.set(0, 2.5, 7);
    camera.lookAt(0, 0.5, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;

    clock = new THREE.Clock();

    buildGarage();
    buildCar();
    addLights();
    addOrbitControls(canvas);
    startRenderLoop();

    // Resize
    window.addEventListener('resize', onResize);
  }

  // ── Garage geometry
  function buildGarage() {
    garageGroup = new THREE.Group();
    scene.add(garageGroup);

    const mat = (color, rough = 0.9, metal = 0.0) => new THREE.MeshStandardMaterial({
      color, roughness: rough, metalness: metal,
    });

    // Floor — concrete
    const floorGeo = new THREE.PlaneGeometry(30, 30, 8, 8);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1e24,
      roughness: 0.95,
      metalness: 0.0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    garageGroup.add(floor);

    // Floor grid lines
    const gridHelper = new THREE.GridHelper(30, 30, 0x202530, 0x202530);
    gridHelper.position.y = 0.001;
    garageGroup.add(gridHelper);

    // Back wall
    const wallMat = mat(0x111418, 0.85);
    addPanel(garageGroup, wallMat, 30, 8, 0.15, 0, 4, -10, 0, 0, 0);
    // Side walls
    addPanel(garageGroup, wallMat, 0.15, 8, 20, -10, 4, 0, 0, 0, 0);
    addPanel(garageGroup, wallMat, 0.15, 8, 20,  10, 4, 0, 0, 0, 0);

    // Ceiling
    addPanel(garageGroup, mat(0x0d1016, 0.9), 30, 0.15, 20, 0, 8, 0, 0, 0, 0);

    // Car lift — pillars
    const liftMat = mat(0x2a3040, 0.4, 0.6);
    addPanel(garageGroup, liftMat, 0.12, 2.5, 0.12, -1.8, 1.25, 0.4, 0, 0, 0);
    addPanel(garageGroup, liftMat, 0.12, 2.5, 0.12,  1.8, 1.25, 0.4, 0, 0, 0);
    // Lift arms
    addPanel(garageGroup, liftMat, 3.6, 0.06, 0.12, 0, 2.5, 0.4, 0, 0, 0);

    // Tool cabinet (left)
    addPanel(garageGroup, mat(0x1c2030, 0.5, 0.3), 1.4, 1.0, 0.5, -4.5, 0.5, -7.5, 0, 0, 0);
    addPanel(garageGroup, mat(0x252d40, 0.4, 0.4), 1.4, 0.08, 0.5, -4.5, 1.04, -7.5, 0, 0, 0);

    // Workbench (right side)
    addPanel(garageGroup, mat(0x1e1a14, 0.8), 2.5, 0.08, 0.7, 5.5, 0.9, -8, 0, 0, 0);
    addPanel(garageGroup, mat(0x1c2030, 0.5), 2.5, 0.9, 0.1, 5.5, 0.45, -8.35, 0, 0, 0);

    // Overhead light rigs
    for (let x = -4; x <= 4; x += 4) {
      addPanel(garageGroup, mat(0x303848, 0.3, 0.5), 1.2, 0.08, 0.3, x, 7.8, -2, 0, 0, 0);
      // light cover
      addPanel(garageGroup, mat(0xe8f0ff, 0.2, 0.0), 0.9, 0.04, 0.22, x, 7.72, -2, 0, 0, 0);
    }

    // Tire stack (back left)
    for (let i = 0; i < 3; i++) {
      const tireGeo = new THREE.TorusGeometry(0.38, 0.13, 8, 20);
      const tireMesh = new THREE.Mesh(tireGeo, mat(0x0e0e0e, 0.95, 0.0));
      tireMesh.rotation.x = Math.PI / 2;
      tireMesh.position.set(-7, 0.38 + i * 0.3, -8.5);
      tireMesh.castShadow = true;
      garageGroup.add(tireMesh);
    }

    // Oil drums
    for (let i = 0; i < 2; i++) {
      const drumGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.85, 12);
      const drumMesh = new THREE.Mesh(drumGeo, mat(0x2a3020, 0.4, 0.3));
      drumMesh.position.set(7.5 + i * 0.45, 0.43, -9);
      drumMesh.castShadow = true;
      garageGroup.add(drumMesh);
    }

    // Exhaust pipes on wall
    for (let i = 0; i < 4; i++) {
      const pipeGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8);
      const pipe = new THREE.Mesh(pipeGeo, mat(0x808090, 0.3, 0.8));
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(-7.5 + i * 0.4, 5.5, -9.8);
      garageGroup.add(pipe);
    }
  }

  function addPanel(group, mat, w, h, d, x, y, z, rx, ry, rz) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // ── Car model
  function buildCar(chassisData) {
    if (carGroup) {
      scene.remove(carGroup);
      carGroup = null;
    }

    carGroup = new THREE.Group();
    carGroup.position.y = 1.0;
    scene.add(carGroup);

    const bodyColor = 0x1a2535;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.2,
      metalness: 0.7,
      envMapIntensity: 1.5,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x304060,
      roughness: 0.0,
      metalness: 0.0,
      transparent: true,
      opacity: 0.4,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.8 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xc0c8d8, roughness: 0.1, metalness: 0.95 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.95 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd0d8e8, roughness: 0.1, metalness: 0.95 });

    // ── Body (main shell)
    const bodyGeo = new THREE.BoxGeometry(1.85, 0.38, 4.2);
    chassisMesh = new THREE.Mesh(bodyGeo, bodyMat);
    chassisMesh.position.y = 0;
    chassisMesh.castShadow = true;
    carGroup.add(chassisMesh);

    // ── Cabin top
    const cabinGeo = new THREE.BoxGeometry(1.6, 0.35, 1.8);
    const cabin = new THREE.Mesh(cabinGeo, bodyMat);
    cabin.position.set(0, 0.36, 0.1);
    cabin.castShadow = true;
    carGroup.add(cabin);

    // Windshield
    const wGeo = new THREE.BoxGeometry(1.45, 0.3, 0.06);
    const windshield = new THREE.Mesh(wGeo, glassMat);
    windshield.position.set(0, 0.42, 0.95);
    windshield.rotation.x = 0.3;
    carGroup.add(windshield);

    // Rear glass
    const rGeo = new THREE.BoxGeometry(1.45, 0.28, 0.06);
    const rearGlass = new THREE.Mesh(rGeo, glassMat);
    rearGlass.position.set(0, 0.38, -0.75);
    rearGlass.rotation.x = -0.25;
    carGroup.add(rearGlass);

    // ── Hood
    const hoodGeo = new THREE.BoxGeometry(1.7, 0.05, 1.4);
    const hood = new THREE.Mesh(hoodGeo, bodyMat);
    hood.position.set(0, 0.22, 1.7);
    hood.castShadow = true;
    carGroup.add(hood);

    // ── Trunk
    const trunkGeo = new THREE.BoxGeometry(1.7, 0.05, 0.9);
    const trunk = new THREE.Mesh(trunkGeo, bodyMat);
    trunk.position.set(0, 0.22, -1.65);
    trunk.castShadow = true;
    carGroup.add(trunk);

    // ── Bumpers
    const bumperMat = new THREE.MeshStandardMaterial({ color: 0x0f1318, roughness: 0.6 });
    const fBumper = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.22, 0.2), bumperMat);
    fBumper.position.set(0, -0.1, 2.1);
    carGroup.add(fBumper);
    const rBumper = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.22, 0.2), bumperMat);
    rBumper.position.set(0, -0.1, -2.1);
    carGroup.add(rBumper);

    // ── Side mirrors
    for (const side of [-1, 1]) {
      const mGeo = new THREE.BoxGeometry(0.06, 0.06, 0.15);
      const mirror = new THREE.Mesh(mGeo, chromeMat);
      mirror.position.set(side * 0.95, 0.52, 0.82);
      carGroup.add(mirror);
    }

    // ── Headlights / taillights
    const hlMat = new THREE.MeshStandardMaterial({ color: 0xffeedd, emissive: 0x443322, roughness: 0.1 });
    const tlMat = new THREE.MeshStandardMaterial({ color: 0xff1111, emissive: 0x330000, roughness: 0.1 });
    for (const side of [-0.65, 0.65]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.04), hlMat);
      hl.position.set(side, 0.08, 2.12);
      carGroup.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.04), tlMat);
      tl.position.set(side, 0.08, -2.12);
      carGroup.add(tl);
    }

    // ── Wheels
    const wheelPositions = [
      [-0.98, -0.25, 1.35],
      [ 0.98, -0.25, 1.35],
      [-0.98, -0.25,-1.35],
      [ 0.98, -0.25,-1.35],
    ];
    wheelPositions.forEach(([x, y, z]) => {
      const tireGeo = new THREE.TorusGeometry(0.31, 0.13, 10, 24);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.y = Math.PI / 2;
      tire.position.set(x, y, z);
      tire.castShadow = true;
      carGroup.add(tire);
      // Rim
      const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.14, 10);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(x, y, z);
      rim.castShadow = true;
      carGroup.add(rim);
    });

    // ── Exhaust pipes
    const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x606070, roughness: 0.2, metalness: 0.9 });
    for (const side of [-0.28, 0.28]) {
      const exGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.35, 8);
      const ex = new THREE.Mesh(exGeo, exhaustMat);
      ex.rotation.x = Math.PI / 2;
      ex.position.set(side, -0.28, -2.1);
      carGroup.add(ex);
    }

    updateEngineVisual(null);
    updateTurboVisual(false);
  }

  function updateEngineVisual(engineData) {
    if (engineMesh) { carGroup.remove(engineMesh); engineMesh = null; }

    const mat = new THREE.MeshStandardMaterial({
      color: engineData ? 0x2a3560 : 0x151820,
      roughness: 0.4,
      metalness: 0.6,
      wireframe: false,
    });

    // Engine block
    const w = engineData ? Math.min(0.55, (engineData.dimensions?.width_mm || 500) / 1000) : 0.3;
    const h = engineData ? Math.min(0.45, (engineData.dimensions?.height_mm || 500) / 1200) : 0.25;
    const l = engineData ? Math.min(0.65, (engineData.dimensions?.length_mm || 600) / 1000) : 0.35;

    const engGroup = new THREE.Group();

    const blockGeo = new THREE.BoxGeometry(w, h, l);
    const block = new THREE.Mesh(blockGeo, mat);
    engGroup.add(block);

    if (engineData) {
      // Valve cover
      const vcMat = new THREE.MeshStandardMaterial({ color: 0x1a2040, roughness: 0.3, metalness: 0.5 });
      const vcGeo = new THREE.BoxGeometry(w * 0.85, h * 0.25, l * 0.9);
      const vc = new THREE.Mesh(vcGeo, vcMat);
      vc.position.y = h * 0.6;
      engGroup.add(vc);

      // Intake manifold
      const intMat = new THREE.MeshStandardMaterial({ color: 0x30304a, roughness: 0.5 });
      const intGeo = new THREE.BoxGeometry(w * 0.6, h * 0.3, l * 0.7);
      const intake = new THREE.Mesh(intGeo, intMat);
      intake.position.set(w * 0.3, h * 0.35, 0);
      engGroup.add(intake);
    }

    engGroup.position.set(0, 0.22, 1.2);
    engGroup.castShadow = true;
    carGroup.add(engGroup);
    engineMesh = engGroup;
  }

  function updateTurboVisual(installed) {
    if (turboMesh) { carGroup.remove(turboMesh); turboMesh = null; }
    if (!installed) return;

    const tMat = new THREE.MeshStandardMaterial({ color: 0x404858, roughness: 0.25, metalness: 0.85 });
    const tGeo = new THREE.SphereGeometry(0.1, 10, 10);
    turboMesh = new THREE.Mesh(tGeo, tMat);
    turboMesh.position.set(0.35, 0.35, 0.9);
    turboMesh.castShadow = true;
    carGroup.add(turboMesh);
  }

  // ── Lighting
  function addLights() {
    ambientLight = new THREE.AmbientLight(0x101520, 0.6);
    scene.add(ambientLight);

    keyLight = new THREE.DirectionalLight(0xfff4e8, 1.2);
    keyLight.position.set(5, 12, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 50;
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 12;
    keyLight.shadow.camera.bottom = -12;
    scene.add(keyLight);

    fillLight = new THREE.DirectionalLight(0xd0e8ff, 0.4);
    fillLight.position.set(-8, 6, 2);
    scene.add(fillLight);

    rimLight = new THREE.DirectionalLight(0xff6020, 0.3);
    rimLight.position.set(0, 4, -10);
    scene.add(rimLight);

    // Overhead workshop lights
    const overheadPositions = [[-4, 7.5, -2], [0, 7.5, -2], [4, 7.5, -2]];
    overheadPositions.forEach(([x, y, z]) => {
      const pt = new THREE.PointLight(0xe8f0ff, 0.8, 12);
      pt.position.set(x, y, z);
      pt.castShadow = false;
      scene.add(pt);
      pointLights.push(pt);
    });
  }

  // ── Simple orbit controls (manual, no plugin needed for r128)
  function addOrbitControls(canvas) {
    let isPointerDown = false;
    let lastX = 0, lastY = 0;
    let theta = 0.3, phi = 0.35, radius = 7;
    let targetTheta = theta, targetPhi = phi, targetRadius = radius;

    function updateCamera() {
      camera.position.x = radius * Math.sin(theta) * Math.cos(phi);
      camera.position.y = 1.5 + radius * Math.sin(phi);
      camera.position.z = radius * Math.cos(theta) * Math.cos(phi);
      camera.lookAt(0, 0.8, 0);
    }
    updateCamera();

    canvas.addEventListener('pointerdown', e => {
      if (isDriving) return;
      isPointerDown = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener('pointerup', () => { isPointerDown = false; });
    window.addEventListener('pointermove', e => {
      if (!isPointerDown || isDriving) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      targetTheta -= dx * 0.008;
      targetPhi    = Math.max(-0.1, Math.min(0.9, targetPhi + dy * 0.005));
    });
    canvas.addEventListener('wheel', e => {
      if (isDriving) return;
      targetRadius = Math.max(2.5, Math.min(18, targetRadius + e.deltaY * 0.01));
      e.preventDefault();
    }, { passive: false });

    // Smooth lerp per frame
    window._orbitUpdate = () => {
      theta   += (targetTheta   - theta)   * 0.1;
      phi     += (targetPhi     - phi)     * 0.1;
      radius  += (targetRadius  - radius)  * 0.1;
      updateCamera();
    };
  }

  // ── Camera modes
  function setCameraMode(mode) {
    switch (mode) {
      case 'garage':
        camera.position.set(0, 2.5, 7);
        camera.lookAt(0, 0.5, 0);
        break;
      case 'enginebay':
        camera.position.set(0, 1.8, 2.5);
        camera.lookAt(0, 1.0, 1.2);
        break;
      case 'front':
        camera.position.set(0, 1.2, 4.5);
        camera.lookAt(0, 0.5, 0);
        break;
      case 'top':
        camera.position.set(0, 7, 0.1);
        camera.lookAt(0, 0, 0);
        break;
      case 'rear':
        camera.position.set(0, 1.5, -5);
        camera.lookAt(0, 0.5, 0);
        break;
    }
  }

  // ── Test drive simulation
  function startDrive(physicsData) {
    isDriving = true;
    driveVelocity = 0;
    driveRPM = physicsData?.idle_rpm || 1200;
    driveGear = 1;

    camera.position.set(0, 2.2, 5.5);

    const maxHP = physicsData?.wheel_horsepower || 300;
    const mass  = physicsData?.total_weight_kg  || 1300;
    const redline = 7200;

    const driveInterval = setInterval(() => {
      if (!isDriving) { clearInterval(driveInterval); return; }

      driveRPM = Math.min(redline, driveRPM + 180);
      driveVelocity = Math.min(
        physicsData?.top_speed_mph || 150,
        driveVelocity + (maxHP / mass) * 0.18
      );

      if (driveRPM > redline * 0.95) {
        driveGear = Math.min(6, driveGear + 1);
        driveRPM  = redline * 0.55;
      }

      window._driveState = {
        speed: driveVelocity,
        rpm: driveRPM,
        gear: driveGear,
        redline,
      };

      // Camera shake
      camera.position.x = (Math.random() - 0.5) * 0.015;
      camera.position.y = 2.2 + (Math.random() - 0.5) * 0.01;

    }, 80);
  }

  function stopDrive() {
    isDriving = false;
    driveVelocity = 0;
    driveRPM = 1200;
    driveGear = 1;
    window._driveState = null;
    camera.position.set(0, 2.5, 7);
    camera.lookAt(0, 0.5, 0);
  }

  // ── Render loop
  function startRenderLoop() {
    let time = 0;
    function animate() {
      animFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      time += delta;

      if (window._orbitUpdate && !isDriving) {
        window._orbitUpdate();
      }

      // Subtle car hover (on lift)
      if (carGroup && !isDriving) {
        carGroup.position.y = 1.0 + Math.sin(time * 0.6) * 0.004;
      }

      // Turbo spin
      if (turboMesh && isDriving) {
        turboMesh.rotation.y += delta * 15;
      }

      // Flicker overhead lights
      if (Math.random() < 0.002) {
        pointLights[0].intensity = 0.3 + Math.random() * 0.5;
      } else {
        pointLights[0].intensity += (0.8 - pointLights[0].intensity) * 0.05;
      }

      renderer.render(scene, camera);
    }
    animate();
  }

  function onResize() {
    const canvas = renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function dispose() {
    cancelAnimationFrame(animFrameId);
    window.removeEventListener('resize', onResize);
    renderer.dispose();
  }

  return {
    init,
    buildCar,
    setCameraMode,
    updateEngineVisual,
    updateTurboVisual,
    startDrive,
    stopDrive,
    dispose,
  };
})();

window.Scene3D = Scene3D;
