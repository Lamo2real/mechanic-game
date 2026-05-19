/* CHASSIS Game — API Client */

const API_BASE = window.location.origin + '/api';

const API = {
  async get(path) {
    const r = await fetch(API_BASE + path);
    if (!r.ok) throw new Error(`API ${path}: ${r.status}`);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`API POST ${path}: ${r.status}`);
    return r.json();
  },
  async put(path, body) {
    const r = await fetch(API_BASE + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`API PUT ${path}: ${r.status}`);
    return r.json();
  },
  async delete(path) {
    const r = await fetch(API_BASE + path, { method: 'DELETE' });
    if (!r.ok) throw new Error(`API DELETE ${path}: ${r.status}`);
    return r.json();
  },

  // ── Parts
  async getParts(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get('/parts/search' + (q ? '?' + q : ''));
  },
  async getPart(id)      { return this.get(`/parts/${id}`); },
  async getChassis()     { return this.get('/chassis'); },
  async getChassisById(id) { return this.get(`/chassis/${id}`); },
  async getEngineCurve(id, boostPsi) {
    const q = boostPsi != null ? `?boost_psi=${boostPsi}` : '';
    return this.get(`/parts/${id}/curve${q}`);
  },

  // ── Builds
  async createBuild(chassisId, name) {
    return this.post('/builds', { chassis_id: chassisId, name });
  },
  async getBuild(id)     { return this.get(`/builds/${id}`); },
  async getBuilds()      { return this.get('/builds'); },
  async installPart(buildId, slot, partId, force = false) {
    return this.put(`/builds/${buildId}/install`, { slot, part_id: partId, force });
  },
  async removePart(buildId, slot) {
    return this.put(`/builds/${buildId}/remove`, { slot });
  },
  async updateTune(buildId, tune) {
    return this.put(`/builds/${buildId}/tune`, tune);
  },
  async getBuildPhysics(buildId) {
    return this.get(`/builds/${buildId}/physics`);
  },

  // ── Compatibility
  async checkCompat(chassisId, partId, slot, installedParts = {}) {
    return this.post('/compatibility/check', {
      chassis_id: chassisId,
      part_id: partId,
      slot,
      installed_parts: installedParts,
    });
  },

  // ── Physics
  async calcPhysics(chassisId, installedParts, tune) {
    return this.post('/physics/calculate', {
      chassis_id: chassisId,
      installed_parts: installedParts,
      tune,
    });
  },
};

window.API = API;
