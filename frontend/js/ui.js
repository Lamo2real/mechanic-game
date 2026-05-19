/* CHASSIS Game — UI Controller */

const UI = (() => {

  // ── State
  let state = {
    allParts: [],
    allChassis: [],
    filteredParts: [],
    selectedPart: null,
    currentBuild: null,
    currentCategory: 'all',
    physics: null,
    isDriving: false,
    pendingSlot: null,
    notifTimer: null,
  };

  // ── Slot config (name, icon, accepted categories)
  const SLOTS = [
    { id: 'engine',        label: 'Engine',         icon: '⚙️',  cats: ['Engine'] },
    { id: 'turbo',         label: 'Turbo',          icon: '🌀',  cats: ['Turbo', 'Supercharger'] },
    { id: 'intercooler',   label: 'Intercooler',    icon: '❄️',  cats: ['Intercooler', 'Cooling'] },
    { id: 'transmission',  label: 'Transmission',   icon: '🔩',  cats: ['Transmission'] },
    { id: 'differential',  label: 'Differential',   icon: '⚙️',  cats: ['Differential'] },
    { id: 'exhaust',       label: 'Exhaust',        icon: '💨',  cats: ['Exhaust'] },
    { id: 'ecu',           label: 'ECU',            icon: '💻',  cats: ['ECU', 'Electronics'] },
    { id: 'suspension_front', label: 'Susp. Front', icon: '🔧',  cats: ['Suspension'] },
    { id: 'suspension_rear',  label: 'Susp. Rear',  icon: '🔧',  cats: ['Suspension'] },
    { id: 'brakes_front',  label: 'Brakes F',       icon: '🛑',  cats: ['Brakes'] },
    { id: 'brakes_rear',   label: 'Brakes R',       icon: '🛑',  cats: ['Brakes'] },
    { id: 'wheels_front',  label: 'Wheels F',       icon: '⭕',  cats: ['Wheels'] },
    { id: 'wheels_rear',   label: 'Wheels R',       icon: '⭕',  cats: ['Wheels'] },
    { id: 'tires_front',   label: 'Tires F',        icon: '🏎️',  cats: ['Tires'] },
    { id: 'tires_rear',    label: 'Tires R',        icon: '🏎️',  cats: ['Tires'] },
    { id: 'aero_front',    label: 'Aero Front',     icon: '🛩️',  cats: ['Aero'] },
    { id: 'aero_rear',     label: 'Aero Rear',      icon: '🛩️',  cats: ['Aero'] },
    { id: 'interior',      label: 'Interior',       icon: '🪑',  cats: ['Interior'] },
    { id: 'roll_cage',     label: 'Roll Cage',      icon: '🔨',  cats: ['Fabrication'] },
    { id: 'fuel_system',   label: 'Fuel System',    icon: '⛽',  cats: ['Fuel'] },
  ];

  const CATEGORIES = [
    'all', 'Engine', 'Turbo', 'Supercharger', 'Intercooler',
    'Transmission', 'Differential', 'Exhaust', 'Suspension',
    'Brakes', 'Wheels', 'Tires', 'Aero', 'Cooling', 'Fuel',
    'Electronics', 'ECU', 'Interior', 'Body', 'Fabrication',
  ];

  // ── Notify banner
  function notify(msg, type = 'info', duration = 3500) {
    const el = document.getElementById('notification');
    if (!el) return;
    clearTimeout(state.notifTimer);
    el.textContent = msg;
    el.className = `notification ${type}`;
    state.notifTimer = setTimeout(() => {
      el.className = 'notification hidden';
    }, duration);
  }

  // ── Init
  async function init() {
    try {
      const [partsRes, chassisRes] = await Promise.all([
        API.getParts({ limit: 200 }),
        API.getChassis(),
      ]);
      state.allParts    = partsRes.parts || [];
      state.allChassis  = chassisRes.chassis || [];
      state.filteredParts = state.allParts;
    } catch (e) {
      notify('Failed to load game data. Is the backend running?', 'error', 9999);
      return;
    }

    buildCategoryTabs();
    renderPartsList();
    bindEvents();
  }

  // ── Chassis selection
  async function selectChassis(chassisId) {
    const chassis = state.allChassis.find(c => c.id === chassisId);
    if (!chassis) return;

    try {
      const build = await API.createBuild(chassisId, chassis.name + ' Build');
      state.currentBuild = build;

      document.getElementById('chassis-select-screen').classList.add('hidden');
      document.getElementById('build-name').textContent = build.name;

      // 3D scene
      Scene3D.buildCar(chassis);
      notify(`${chassis.name} loaded — let's build!`, 'success');

      renderBuildSlots();
      await refreshPhysics();
    } catch (e) {
      notify('Error creating build: ' + e.message, 'error');
    }
  }

  // ── Part search & filter
  function filterParts(query = '', category = 'all') {
    let parts = state.allParts;
    if (category !== 'all') {
      parts = parts.filter(p => p.category === category);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      parts = parts.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    }
    state.filteredParts = parts;
    renderPartsList();
  }

  // ── Part list render
  function renderPartsList() {
    const list = document.getElementById('parts-list');
    if (!list) return;

    const parts = state.filteredParts;
    if (!parts.length) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:#506070;font-size:12px;">No parts found</div>';
      return;
    }

    const installed = state.currentBuild
      ? Object.values(state.currentBuild.installed_parts || {})
      : [];

    list.innerHTML = parts.map(p => {
      const isInstalled = installed.includes(p.id);
      const hasFab = p.requires_fabrication;
      let specHtml = '';

      if (p.horsepower_stock) {
        specHtml += `<div class="part-spec"><strong>${p.horsepower_stock}</strong> hp</div>`;
      }
      if (p.torque_nm_stock) {
        specHtml += `<div class="part-spec"><strong>${p.torque_nm_stock}</strong> Nm</div>`;
      }
      if (p.max_hp_support) {
        specHtml += `<div class="part-spec">Supports <strong>${p.max_hp_support}</strong> hp</div>`;
      }
      if (p.max_boost_psi) {
        specHtml += `<div class="part-spec"><strong>${p.max_boost_psi}</strong> psi max</div>`;
      }
      if (p.max_torque_nm) {
        specHtml += `<div class="part-spec">Max <strong>${p.max_torque_nm}</strong> Nm</div>`;
      }
      if (p.grip_index) {
        specHtml += `<div class="part-spec">Grip <strong>${(p.grip_index * 100).toFixed(0)}%</strong></div>`;
      }
      specHtml += `<div class="part-spec"><strong>${p.weight_kg}</strong> kg</div>`;

      return `
        <div class="part-card ${isInstalled ? 'installed' : ''}" data-part-id="${p.id}">
          <div class="part-price">$${p.price_usd?.toLocaleString()}</div>
          <div class="part-brand">${p.brand}</div>
          <div class="part-name">${p.name}</div>
          <div class="part-specs">${specHtml}</div>
          <div style="margin-top:4px;">
            ${hasFab ? '<span class="part-badge badge-fab">FABRICATION</span>' : ''}
            ${isInstalled ? '<span class="part-badge badge-installed">INSTALLED</span>' : ''}
          </div>
        </div>`;
    }).join('');

    // Click events
    list.querySelectorAll('.part-card').forEach(card => {
      card.addEventListener('click', () => {
        const part = state.allParts.find(p => p.id === card.dataset.partId);
        if (part) selectPart(part);
      });
    });
  }

  // ── Select a part
  async function selectPart(part) {
    state.selectedPart = part;
    document.querySelectorAll('.part-card').forEach(c => c.classList.remove('selected'));
    const card = document.querySelector(`[data-part-id="${part.id}"]`);
    if (card) card.classList.add('selected');
    showPartModal(part);
  }

  // ── Part detail modal
  async function showPartModal(part) {
    const modal = document.getElementById('part-detail-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    // Build spec rows
    const specRows = buildSpecRows(part);

    // Check compat if build exists
    let compatHtml = '';
    let slotOptions = '';
    if (state.currentBuild) {
      const relevantSlots = SLOTS.filter(s => s.cats.includes(part.category));
      slotOptions = relevantSlots.map(s =>
        `<option value="${s.id}">${s.label}</option>`
      ).join('');
    }

    modal.querySelector('.modal-title').textContent = part.name;
    modal.querySelector('.modal-brand').textContent = part.brand + ' · ' + part.category;
    modal.querySelector('.modal-desc').textContent  = part.description || '';
    modal.querySelector('.modal-specs').innerHTML   = specRows;

    const fabDiv = modal.querySelector('.modal-fab-list');
    if (part.requires_fabrication) {
      fabDiv.style.display = '';
      fabDiv.querySelector('.modal-fab-title').textContent = `Fabrication Required (Difficulty: ${part.fabrication_difficulty || '?'}/10)`;
    } else {
      fabDiv.style.display = 'none';
    }

    const actionsDiv = modal.querySelector('.modal-actions');
    if (state.currentBuild && slotOptions) {
      actionsDiv.innerHTML = `
        <select id="slot-select" style="
          padding:7px 10px;background:var(--bg-card);
          border:1px solid var(--border);border-radius:var(--radius);
          color:var(--text-primary);font-size:12px;flex:1;
        ">${slotOptions}</select>
        <button class="action-btn install" id="modal-install-btn">INSTALL</button>
        <button class="action-btn remove" id="modal-close-btn">CANCEL</button>
      `;
      document.getElementById('modal-install-btn').onclick = async () => {
        const slot = document.getElementById('slot-select').value;
        await installPart(part.id, slot);
        closeModal();
      };
      document.getElementById('modal-close-btn').onclick = closeModal;
    } else {
      actionsDiv.innerHTML = `<button class="action-btn remove" id="modal-close-btn">CLOSE</button>`;
      document.getElementById('modal-close-btn').onclick = closeModal;
    }
  }

  function closeModal() {
    const modal = document.getElementById('part-detail-modal');
    if (modal) modal.classList.add('hidden');
  }

  function buildSpecRows(part) {
    const fields = [];
    if (part.horsepower_stock) fields.push(['Stock HP', part.horsepower_stock + ' hp']);
    if (part.torque_nm_stock)  fields.push(['Stock Torque', part.torque_nm_stock + ' Nm']);
    if (part.horsepower_potential) fields.push(['HP Potential', part.horsepower_potential + ' hp']);
    if (part.redline_rpm)      fields.push(['Redline', part.redline_rpm.toLocaleString() + ' rpm']);
    if (part.displacement_cc)  fields.push(['Displacement', (part.displacement_cc / 1000).toFixed(1) + 'L']);
    if (part.cylinder_config)  fields.push(['Config', part.cylinder_config]);
    if (part.aspiration)       fields.push(['Aspiration', part.aspiration]);
    if (part.boost_psi_stock)  fields.push(['Boost Stock', part.boost_psi_stock + ' psi']);
    if (part.max_boost_psi)    fields.push(['Max Boost', part.max_boost_psi + ' psi']);
    if (part.max_hp_support)   fields.push(['HP Support', part.max_hp_support + ' hp']);
    if (part.spool_rpm)        fields.push(['Spool RPM', part.spool_rpm.toLocaleString()]);
    if (part.gear_count)       fields.push(['Gears', part.gear_count]);
    if (part.trans_type)       fields.push(['Type', part.trans_type]);
    if (part.max_torque_nm)    fields.push(['Max Torque', part.max_torque_nm + ' Nm']);
    if (part.spring_rate_n_mm) fields.push(['Spring Rate', part.spring_rate_n_mm + ' N/mm']);
    if (part.grip_index)       fields.push(['Grip Index', (part.grip_index * 100).toFixed(0) + '%']);
    if (part.compound)         fields.push(['Compound', part.compound]);
    if (part.ecu_type)         fields.push(['ECU Type', part.ecu_type]);
    if (part.max_cylinders)    fields.push(['Max Cyl.', part.max_cylinders]);
    fields.push(['Weight', part.weight_kg + ' kg']);
    fields.push(['Price', '$' + part.price_usd?.toLocaleString()]);
    if (part.dimensions) {
      fields.push(['Dimensions', `${part.dimensions.length_mm}×${part.dimensions.width_mm}×${part.dimensions.height_mm} mm`]);
    }

    return fields.map(([label, val]) => `
      <div class="modal-spec-row">
        <div class="modal-spec-label">${label}</div>
        <div class="modal-spec-value">${val}</div>
      </div>
    `).join('');
  }

  // ── Install part
  async function installPart(partId, slot, force = false) {
    if (!state.currentBuild) {
      notify('Select a chassis first!', 'error');
      return;
    }

    notify('Checking compatibility...', 'info', 1500);

    try {
      const result = await API.installPart(state.currentBuild.id, slot, partId, force);

      if (!result.success && !force) {
        const compat = result.compatibility;
        const errMsg = compat.errors?.join(' ') || 'Compatibility issue';
        const warnMsg = compat.warnings?.slice(0,2).join(' ') || '';
        const fabItems = compat.fabrication_items?.slice(0,3).join(', ') || '';

        if (compat.errors?.length) {
          notify(`❌ ${errMsg}`, 'error', 6000);
        } else if (compat.requires_fabrication) {
          // Confirm fabrication
          const ok = confirm(
            `Fabrication Required (Fitment Score: ${compat.fitment_score.toFixed(0)}%)\n\n` +
            `Items needed:\n• ${compat.fabrication_items?.join('\n• ')}\n\n` +
            (compat.warnings?.length ? `Warnings:\n• ${compat.warnings.join('\n• ')}\n\n` : '') +
            'Install anyway? (Fabrication will be logged)'
          );
          if (ok) await installPart(partId, slot, true);
        }
        return;
      }

      state.currentBuild = result.build;
      const part = state.allParts.find(p => p.id === partId);
      const compat = result.compatibility;

      if (compat?.warnings?.length) {
        notify(`✅ ${part?.name} installed. ⚠️ ${compat.warnings[0]}`, 'warning', 5000);
      } else {
        notify(`✅ ${part?.name} installed in [${slot}]`, 'success');
      }

      // 3D updates
      if (slot === 'engine') Scene3D.updateEngineVisual(part);
      if (slot === 'turbo')  Scene3D.updateTurboVisual(true);

      renderBuildSlots();
      renderPartsList();
      await refreshPhysics();

      // Draw dyno curve for engine installs
      if (slot === 'engine') {
        try {
          const curve = await API.getEngineCurve(partId, state.currentBuild?.tune?.boost_psi);
          drawDynoChart(curve.curve);
        } catch {}
      }

    } catch (e) {
      notify('Install error: ' + e.message, 'error');
    }
  }

  // ── Remove part from slot
  async function removeFromSlot(slot) {
    if (!state.currentBuild) return;
    try {
      const result = await API.removePart(state.currentBuild.id, slot);
      state.currentBuild = result.build;
      if (slot === 'engine')  Scene3D.updateEngineVisual(null);
      if (slot === 'turbo')   Scene3D.updateTurboVisual(false);
      notify(`Removed from [${slot}]`, 'info');
      renderBuildSlots();
      renderPartsList();
      await refreshPhysics();
    } catch (e) {
      notify('Remove error: ' + e.message, 'error');
    }
  }

  // ── Build slots panel
  function renderBuildSlots() {
    const container = document.getElementById('build-slots');
    if (!container || !state.currentBuild) return;

    const installed = state.currentBuild.installed_parts || {};

    container.innerHTML = SLOTS.map(slot => {
      const partId  = installed[slot.id];
      const part    = partId ? state.allParts.find(p => p.id === partId) : null;
      const isFilled = !!part;

      return `
        <div class="slot-row ${isFilled ? 'filled' : ''}" data-slot="${slot.id}">
          <div class="slot-icon">${slot.icon}</div>
          <div class="slot-info">
            <div class="slot-name">${slot.label}</div>
            <div class="slot-part ${isFilled ? '' : 'empty'}">${part ? part.name : 'Empty'}</div>
          </div>
          ${isFilled ? `<div class="slot-remove" data-slot="${slot.id}" title="Remove">✕</div>` : ''}
        </div>`;
    }).join('');

    // Click slot to filter parts for that slot
    container.querySelectorAll('.slot-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('slot-remove')) return;
        const slotId = row.dataset.slot;
        const slotDef = SLOTS.find(s => s.id === slotId);
        if (slotDef) {
          state.pendingSlot = slotId;
          const cat = slotDef.cats[0];
          setCategory(cat);
          notify(`Showing ${cat} parts — click a part to install in [${slotId}]`, 'info', 4000);
        }
      });
    });

    container.querySelectorAll('.slot-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromSlot(btn.dataset.slot);
      });
    });
  }

  // ── Physics panel
  async function refreshPhysics() {
    if (!state.currentBuild) return;
    try {
      const p = await API.getBuildPhysics(state.currentBuild.id);
      state.physics = p;
      renderPhysicsPanel(p);
    } catch (e) {
      console.warn('Physics update failed', e);
    }
  }

  function renderPhysicsPanel(p) {
    const panel = document.getElementById('physics-stats');
    if (!panel) return;

    const color = (val, good, warn) =>
      val <= good ? 'good' : val <= warn ? 'warn' : 'bad';

    const colorRev = (val, good, warn) =>
      val >= good ? 'good' : val >= warn ? 'warn' : 'bad';

    panel.innerHTML = `
      <div class="stat-row">
        <span class="stat-label">0–60 mph</span>
        <span class="stat-value ${color(p.zero_to_60_mph_sec, 4.5, 7.0)}">${p.zero_to_60_mph_sec}s</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">¼ Mile</span>
        <span class="stat-value ${color(p.quarter_mile_sec, 12, 16)}">${p.quarter_mile_sec}s @ ${p.quarter_mile_trap_mph} mph</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Top Speed</span>
        <span class="stat-value ${colorRev(p.top_speed_mph, 160, 100)}">${p.top_speed_mph} mph</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Wheel HP</span>
        <span class="stat-value ${colorRev(p.wheel_horsepower, 400, 200)}">${p.wheel_horsepower} hp</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Wheel Torque</span>
        <span class="stat-value">${p.wheel_torque_nm} Nm</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">HP / Ton</span>
        <span class="stat-value ${colorRev(p.power_to_weight_hp_ton, 350, 200)}">${p.power_to_weight_hp_ton}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Total Weight</span>
        <span class="stat-value">${p.total_weight_kg} kg</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Weight Dist.</span>
        <span class="stat-value ${Math.abs(p.weight_dist_front_pct - 50) < 5 ? 'good' : 'warn'}">${p.weight_dist_front_pct}% front</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Lateral G</span>
        <span class="stat-value ${colorRev(p.lateral_g_max, 1.2, 0.8)}">${p.lateral_g_max}g</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Braking 60→0</span>
        <span class="stat-value ${color(p.braking_60_to_0_ft, 100, 140)}">${p.braking_60_to_0_ft} ft</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Boost</span>
        <span class="stat-value">${p.boost_psi_actual} psi</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Downforce @100</span>
        <span class="stat-value">${p.downforce_kg_at_100mph} kg</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Drivetrain Loss</span>
        <span class="stat-value">${p.drivetrain_loss_pct}%</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Engine Temp</span>
        <span class="stat-value ${color(p.engine_temp_c, 100, 115)}">${p.engine_temp_c}°C</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Reliability</span>
        <span class="stat-value ${colorRev(p.reliability_score, 80, 50)}">${p.reliability_score}/100</span>
      </div>
    `;

    // Warnings
    const warnPanel = document.getElementById('warnings-list');
    if (warnPanel) {
      if (!p.warnings?.length) {
        warnPanel.innerHTML = '<div class="warning-item ok">✅ No issues detected</div>';
      } else {
        warnPanel.innerHTML = p.warnings.map(w =>
          `<div class="warning-item warn">⚠️ ${w}</div>`
        ).join('');
      }
    }
  }

  // ── Dyno chart (canvas)
  function drawDynoChart(curveData) {
    const canvas = document.getElementById('dyno-canvas');
    if (!canvas || !curveData?.length) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    const maxRPM  = Math.max(...curveData.map(d => d.rpm));
    const maxHP   = Math.max(...curveData.map(d => d.hp), 1);
    const maxTorq = Math.max(...curveData.map(d => d.torque_nm), 1);

    // Background
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = '#1a1f2e';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const toX = rpm => (rpm / maxRPM) * W;

    // Torque line (blue)
    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    curveData.forEach((d, i) => {
      const x = toX(d.rpm);
      const y = H - (d.torque_nm / maxTorq) * H * 0.88 - H * 0.06;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // HP line (orange)
    ctx.beginPath();
    ctx.strokeStyle = '#ff6b00';
    ctx.lineWidth = 2;
    curveData.forEach((d, i) => {
      const x = toX(d.rpm);
      const y = H - (d.hp / maxHP) * H * 0.88 - H * 0.06;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#ff6b00';
    ctx.font = '9px monospace';
    ctx.fillText(`${maxHP.toFixed(0)} hp`, 4, 12);
    ctx.fillStyle = '#3b82f6';
    ctx.fillText(`${maxTorq.toFixed(0)} Nm`, 4, 24);
  }

  // ── Tune panel
  function renderTunePanel() {
    const panel = document.getElementById('tune-panel');
    if (!panel || !state.currentBuild) return;

    const tune = state.currentBuild.tune || {};
    const engineId = state.currentBuild.installed_parts?.engine;
    const engine = state.allParts.find(p => p.id === engineId);
    const maxBoost = engine?.boost_psi_stock ? engine.boost_psi_stock * 3.0 : 30;

    panel.innerHTML = `
      <div class="tune-control">
        <div class="tune-label">
          <span>Boost Pressure</span>
          <span id="boost-val">${tune.boost_psi ?? (engine?.boost_psi_stock ?? 0)} psi</span>
        </div>
        <input type="range" class="tune-slider" id="boost-slider"
          min="0" max="${maxBoost}" step="0.5"
          value="${tune.boost_psi ?? (engine?.boost_psi_stock ?? 0)}">
      </div>
      <div class="tune-control">
        <div class="tune-label">
          <span>Ignition Timing</span>
          <span id="timing-val">${tune.ignition_timing_deg ?? 14}°</span>
        </div>
        <input type="range" class="tune-slider" id="timing-slider"
          min="5" max="30" step="0.5"
          value="${tune.ignition_timing_deg ?? 14}">
      </div>
      <div class="tune-control">
        <div class="tune-label">
          <span>Fuel Map Trim</span>
          <span id="fuel-val">${tune.fuel_map_pct ?? 0}%</span>
        </div>
        <input type="range" class="tune-slider" id="fuel-slider"
          min="-20" max="20" step="0.5"
          value="${tune.fuel_map_pct ?? 0}">
      </div>
      <div class="tune-control">
        <div class="tune-label">
          <span>Launch RPM</span>
          <span id="launch-val">${tune.launch_rpm ?? 3000} rpm</span>
        </div>
        <input type="range" class="tune-slider" id="launch-slider"
          min="1500" max="6000" step="100"
          value="${tune.launch_rpm ?? 3000}">
      </div>
    `;

    const applyTune = debounce(async () => {
      const newTune = {
        boost_psi:           parseFloat(document.getElementById('boost-slider').value),
        ignition_timing_deg: parseFloat(document.getElementById('timing-slider').value),
        fuel_map_pct:        parseFloat(document.getElementById('fuel-slider').value),
        launch_rpm:          parseInt(document.getElementById('launch-slider').value),
      };
      if (state.currentBuild) {
        try {
          const res = await API.updateTune(state.currentBuild.id, newTune);
          state.currentBuild = res.build;
          await refreshPhysics();
        } catch {}
      }
    }, 400);

    const bindSlider = (id, labelId, suffix) => {
      const slider = document.getElementById(id);
      const label  = document.getElementById(labelId);
      if (slider && label) {
        slider.addEventListener('input', () => {
          label.textContent = slider.value + suffix;
          applyTune();
        });
      }
    };

    bindSlider('boost-slider',  'boost-val',  ' psi');
    bindSlider('timing-slider', 'timing-val', '°');
    bindSlider('fuel-slider',   'fuel-val',   '%');
    bindSlider('launch-slider', 'launch-val', ' rpm');
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  // ── Category tabs
  function buildCategoryTabs() {
    const container = document.getElementById('category-tabs');
    if (!container) return;
    container.innerHTML = CATEGORIES.map(cat =>
      `<div class="cat-tab ${cat === 'all' ? 'active' : ''}" data-cat="${cat}">${cat === 'all' ? 'ALL' : cat}</div>`
    ).join('');
    container.querySelectorAll('.cat-tab').forEach(tab => {
      tab.addEventListener('click', () => setCategory(tab.dataset.cat));
    });
  }

  function setCategory(cat) {
    state.currentCategory = cat;
    document.querySelectorAll('.cat-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.cat === cat);
    });
    filterParts(document.getElementById('search-input')?.value || '', cat);
  }

  // ── Test drive
  async function startTestDrive() {
    if (!state.currentBuild) {
      notify('Build a vehicle first!', 'error');
      return;
    }
    if (state.isDriving) return;

    const engineId = state.currentBuild.installed_parts?.engine;
    if (!engineId) {
      notify('Install an engine first!', 'error');
      return;
    }

    state.isDriving = true;
    const hud = document.getElementById('hud');
    if (hud) hud.classList.add('active');

    Scene3D.startDrive(state.physics);
    notify('TEST DRIVE — ENGAGE', 'success', 2000);

    // Update HUD
    const hudInterval = setInterval(() => {
      if (!state.isDriving) { clearInterval(hudInterval); return; }
      const ds = window._driveState;
      if (!ds) return;
      const speedEl = document.getElementById('hud-speed');
      const rpmEl   = document.getElementById('rpm-fill');
      const gearEl  = document.getElementById('hud-gear');
      if (speedEl) speedEl.textContent = Math.round(ds.speed);
      if (gearEl)  gearEl.textContent  = ds.gear;
      if (rpmEl) {
        const pct = Math.min(100, (ds.rpm / ds.redline) * 100);
        rpmEl.style.width = pct + '%';
        rpmEl.style.background = pct > 90 ? '#ef4444' : pct > 75 ? '#eab308' : '#ff6b00';
      }
      if (ds.speed >= (state.physics?.top_speed_mph || 999) * 0.98) {
        stopTestDrive();
      }
    }, 100);

    setTimeout(() => {
      if (state.isDriving) stopTestDrive();
    }, 18000);
  }

  function stopTestDrive() {
    state.isDriving = false;
    Scene3D.stopDrive();
    const hud = document.getElementById('hud');
    if (hud) hud.classList.remove('active');
    if (state.physics) {
      notify(
        `Run complete: 0–60 = ${state.physics.zero_to_60_mph_sec}s | ¼ mile = ${state.physics.quarter_mile_sec}s`,
        'success',
        5000
      );
    }
  }

  // ── Chassis select screen
  function renderChassisSelectScreen() {
    const grid = document.getElementById('chassis-select-grid');
    if (!grid) return;

    const driveClass = { FR: 'fr', AWD: 'awd', MR: 'mr', RR: 'rr', FF: 'ff', EV: 'awd' };
    const icons = {
      nissan_s15: '🏎️', toyota_supra_a80: '🚗', mazda_rx7_fd: '🔵',
      bmw_e46_m3: '🇩🇪', honda_s2000_ap1: '🏁', subaru_gc8_sti: '⛰️',
      mitsubishi_evo9: '⚡', classic_mustang_1969: '🇺🇸', toyota_ae86: '⛰️',
      tube_frame_race: '🏗️', dodge_viper_gts: '🐍', vw_beetle_1967: '🌼',
    };

    grid.innerHTML = state.allChassis.map(c => `
      <div class="chassis-select-card" data-chassis="${c.id}">
        <div class="cscard-icon">${icons[c.id] || '🚗'}</div>
        <div class="cscard-name">${c.name}</div>
        <div class="cscard-year">${c.year_range}</div>
        <div class="cscard-specs">
          Bay: ${c.engine_bay.length_mm}×${c.engine_bay.width_mm}mm<br>
          Max Engine: ${c.max_engine_weight_kg} kg
        </div>
        <div class="cscard-price">$${c.price_usd?.toLocaleString()}</div>
        <span class="cscard-drive drive-${driveClass[c.drivetrain_stock] || 'fr'}">${c.drivetrain_stock}</span>
      </div>
    `).join('');

    grid.querySelectorAll('.chassis-select-card').forEach(card => {
      card.addEventListener('click', () => selectChassis(card.dataset.chassis));
    });
  }

  // ── Event bindings
  function bindEvents() {
    // Search
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        filterParts(searchInput.value, state.currentCategory);
      });
    }

    // Camera mode buttons
    document.querySelectorAll('.cam-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Scene3D.setCameraMode(btn.dataset.mode);
      });
    });

    // Test drive button
    const driveBtn = document.getElementById('test-drive-btn');
    if (driveBtn) driveBtn.addEventListener('click', startTestDrive);

    // HUD exit
    const hudExit = document.getElementById('hud-exit');
    if (hudExit) hudExit.addEventListener('click', stopTestDrive);

    // New build button
    const newBuild = document.getElementById('new-build-btn');
    if (newBuild) {
      newBuild.addEventListener('click', () => {
        document.getElementById('chassis-select-screen').classList.remove('hidden');
        renderChassisSelectScreen();
      });
    }

    // Modal background close
    const modal = document.getElementById('part-detail-modal');
    if (modal) {
      modal.addEventListener('click', e => {
        if (e.target === modal) closeModal();
      });
    }

    // Chassis screen on first load
    renderChassisSelectScreen();
  }

  // Public API
  return {
    init,
    selectChassis,
    installPart,
    filterParts,
    notify,
    renderTunePanel,
    refreshPhysics,
  };

})();

window.UI = UI;
