import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ═══════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════
const BASE = "/NSA/EcorecServerAngular/rest/main/execute/servlet";
const CLEF_USER = 676;
const NOM_USER = "QABICE";
const CLEF_SITE = 27;

const OPERATIONS = [
  { id: 2, nom: "Rotation", icon: "🔄", color: "#3b82f6" },
  { id: 1, nom: "Retrait", icon: "📤", color: "#ef4444" },
  { id: 8, nom: "Vidage A/R", icon: "🔃", color: "#8b5cf6" },
];

const PERIODES = [
  { id: 1, nom: "MATIN" },
  { id: 2, nom: "APRÈS-MIDI" },
  { id: 3, nom: "SOIR" },
];

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════
function today(off = 0) {
  const d = new Date();
  d.setDate(d.getDate() + off);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function fmtDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function chantierHue(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++)
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  const hues = [210, 340, 150, 30, 270, 180, 50, 300, 120, 0, 240, 60];
  return hues[Math.abs(h) % hues.length];
}

function normalizeChantier(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (obj.codeClient || obj.nomClient || obj.compteComptable) return null;
  const id = obj.id || obj.clefChantier || obj.idChantier || 0;
  const nom =
    obj.nom ||
    obj.nomChantier ||
    obj.numChantier ||
    obj.libelleObjetEntite ||
    "";
  if (!id || !nom) return null;
  return {
    ...obj,
    id: +id,
    nom,
    adresse1: obj.adresse1 || "",
    cp: obj.codePostal || obj.cp || "",
    ville: obj.ville || "",
    clientId: obj.client?.id || 0,
    clientNom: obj.client?.nomClient || "",
  };
}
function normalizeBenne(b) {
  if (!b || typeof b !== "object") return null;
  const id = b.id || b.clefBenne || b.clefBenneChantier || 0;
  if (!id) return null;
  return {
    ...b,
    id: +id,
    clefChantier: String(
      b.clefChantier || (b.chantier && b.chantier.id) || ""
    ),
    NumBenne: b.NumBenne || b.numBenne || "",
    typeContenant: b.typeContenant || b.type || null,
    art: b.art || b.article || null,
    exu: b.exu || b.exutoire || null,
  };
}
function looksLikeBenne(item) {
  if (!item || typeof item !== "object") return false;
  return !!(
    item.art ||
    item.typeContenant ||
    item.exu ||
    item.clefChantier ||
    item.numBenne ||
    item.NumBenne ||
    item.typeBenne ||
    item.benneColl ||
    item.qteContenant ||
    item.chantier
  );
}
function uniqById(arr) {
  const map = new Map();
  for (const item of arr) {
    if (item && item.id != null && !map.has(String(item.id)))
      map.set(String(item.id), item);
  }
  return [...map.values()];
}

// ═══════════════════════════════════════════════════════
//  API LAYER
// ═══════════════════════════════════════════════════════
async function apiRaw(payload) {
  const body = new URLSearchParams();
  body.append("param", JSON.stringify(payload));
  const r = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    credentials: "include",
    body: body.toString(),
  });
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
async function api(servlet, mod, data_, options = {}) {
  return await apiRaw({
    servlet,
    module: mod,
    type: options.type || "map",
    compression: options.compression || "false",
    data: data_,
  });
}
async function getChantier(id) {
  return await api("DBGetChantier", "Recylog", ["DBGetChantier", +id], {
    type: "tableau",
  });
}
async function rechercheClient(clientId, chantierId, critere = "") {
  return await api(
    "DBRechercheClient",
    "Recylog",
    {
      CLEF_CLIENT: String(clientId || 0),
      CLEF_SITE: String(CLEF_SITE),
      CRITERE_CHANTIER: critere || "",
      CLEF_CHANTIER: String(chantierId || 0),
      CACHER_PAV: { typeParam: "boolean", valeur: true },
      IS_OPTIMISER_CHAMPS: { typeParam: "boolean", valeur: true },
    },
    { type: "map", compression: "true" }
  );
}
async function listeBenneChantier(id) {
  return await api("DBListeBenneChantier", "Ecobennes", {
    CLEF_CHANTIER: { typeParam: "int", valeur: +id },
    CLEF_SITE: { typeParam: "int", valeur: +CLEF_SITE },
    CLEF_USER: { typeParam: "int", valeur: +CLEF_USER },
  });
}
async function rechercheBenne(chantierId, clientId) {
  return await api("DBRechercheBenne", "Ecobennes", {
    CLEF_SITE: { typeParam: "int", valeur: +CLEF_SITE },
    CLEF_CLIENT: { typeParam: "int", valeur: +(clientId || 0) },
    CLEF_CHANTIER: { typeParam: "int", valeur: +chantierId },
    CLEF_USER: { typeParam: "int", valeur: +CLEF_USER },
  });
}
async function rechercheChantierLegacy(critere, clientId) {
  return await api("DBRechercheChantier", "Ecobennes", {
    CLEF_SITE: { typeParam: "int", valeur: +CLEF_SITE },
    CLEF_CLIENT: { typeParam: "int", valeur: +(clientId || 0) },
    CRITERE: { typeParam: "string", valeur: critere || "" },
    CLEF_USER: { typeParam: "int", valeur: +CLEF_USER },
    CACHER_PAV: { typeParam: "boolean", valeur: true },
  });
}
async function listPlanningDate(dateIso, histo = false) {
  return await api(
    "DBListChaufMouvDate",
    "Ecobennes",
    {
      DATE: dateIso,
      SITE: String(CLEF_SITE),
      CLEF_USER: String(CLEF_USER),
      SELECT_MOUV_HISTO: { typeParam: "boolean", valeur: histo },
      FILTRE_RECEPTION_CHANTIER: { typeParam: "boolean", valeur: false },
      RECEPTION_CHANTIER: { typeParam: "boolean", valeur: false },
      CLEF_CLIENT: { typeParam: "int", valeur: "0" },
      CLEF_AGENCE: { typeParam: "int", valeur: "0" },
      CLEF_CHANTIER: { typeParam: "int", valeur: "0" },
      CLEF_TYPE_EQUIPEMENT: "",
      EXCLURE: { typeParam: "boolean", valeur: "false" },
      CLEF_PARKING: { typeParam: "int", valeur: "0" },
      CLEF_ZONE: { typeParam: "int", valeur: "0" },
      DUPLIQUER_REALISE: { typeParam: "boolean", valeur: "true" },
      DEPUIS_ANGULAR: { typeParam: "boolean", valeur: "true" },
    },
    { type: "map", compression: "true" }
  );
}
async function getListChauffeurRH(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date(date);
  const dateFr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return await api("DBGetListChauffeurRH", "Recylog", {
    SITE: String(CLEF_SITE),
    DATE: { typeParam: "date", valeur: dateFr },
    DATE_DEBUT: "null",
    DATE_FIN: "null",
    IS_MULTIBENNE: { typeParam: "boolean", valeur: false },
    FILTRE_TEXTE: "",
    CLEF_QUALIFICATION: { typeParam: "int", valeur: "0" },
    IS_FILTRER_INTERIMAIRES: { typeParam: "boolean", valeur: true },
    IS_FILTRER_INDISPONIBLES: { typeParam: "boolean", valeur: true },
    IS_FILTRER_JOUR_TRAVAIL: { typeParam: "boolean", valeur: true },
    IS_FILTRER_CHAUFFEUR: { typeParam: "boolean", valeur: false },
    IS_FILTRER_INTERIMAIRES_ASSIGNATION: {
      typeParam: "boolean",
      valeur: true,
    },
    NE_PAS_INCLURE_INTERIMAIRE: { typeParam: "boolean", valeur: false },
    FILTRER_VISIBLE_PLANNING: { typeParam: "boolean", valeur: true },
    FILTRER_ENTRETIEN_BAC: { typeParam: "boolean", valeur: false },
    FILTRER_CONTRAT_PERSO: { typeParam: "boolean", valeur: true },
    AJOUTER_INTERIMAIRE_EN_MISSION: { typeParam: "boolean", valeur: false },
  });
}

// ═══════════════════════════════════════════════════════
//  PARSERS
// ═══════════════════════════════════════════════════════
function parseChantiers(res, out = []) {
  if (!res) return out;
  const push = (x) => {
    const c = normalizeChantier(x);
    if (c) out.push(c);
  };
  if (Array.isArray(res.data)) {
    for (const item of res.data) {
      if (!item || typeof item !== "object") continue;
      if (Array.isArray(item.listChantier)) item.listChantier.forEach(push);
      if (item.chantier) push(item.chantier);
      push(item);
    }
  }
  if (res.data && !Array.isArray(res.data)) {
    if (Array.isArray(res.data.listChantier))
      res.data.listChantier.forEach(push);
    if (res.data.chantier) push(res.data.chantier);
    push(res.data);
  }
  if (Array.isArray(res.listChantier)) res.listChantier.forEach(push);
  if (res.chantier) push(res.chantier);
  return uniqById(out);
}
function extractListBenne(res) {
  if (!res) return [];
  const found = [];
  const collect = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (looksLikeBenne(item)) {
        const b = normalizeBenne(item);
        if (b) found.push(b);
      }
    }
  };
  collect(res.listBenne);
  if (res.data && !Array.isArray(res.data) && Array.isArray(res.data.listBenne))
    collect(res.data.listBenne);
  if (Array.isArray(res.data)) {
    for (const item of res.data) {
      if (!item || typeof item !== "object") continue;
      if (looksLikeBenne(item)) {
        const b = normalizeBenne(item);
        if (b) found.push(b);
      }
      if (Array.isArray(item.listBenne)) collect(item.listBenne);
      if (Array.isArray(item.listChantier)) {
        for (const ch of item.listChantier) {
          if (Array.isArray(ch.listBenne)) collect(ch.listBenne);
        }
      }
    }
  }
  return uniqById(found);
}

// ═══════════════════════════════════════════════════════
//  SEARCH / BENNE LOGIC
// ═══════════════════════════════════════════════════════
async function chercherChantiers(critere, clientId) {
  const results = [];
  const c = String(critere || "").trim();
  if (!c && !clientId) return [];
  if (/^\d+$/.test(c)) {
    try {
      parseChantiers(await getChantier(+c), results);
    } catch {}
    try {
      const r = await rechercheClient(clientId || 0, +c, "");
      parseChantiers(r, results);
      const lb = extractListBenne(r);
      if (lb.length) {
        let ch = results.find((x) => +x.id === +c);
        if (!ch) {
          ch = { id: +c, nom: "Chantier #" + c };
          results.push(ch);
        }
        ch.listBenne = uniqById([...(ch.listBenne || []), ...lb]);
      }
    } catch {}
    try {
      const r = await listeBenneChantier(+c);
      const lb = extractListBenne(r);
      if (lb.length) {
        let ch = results.find((x) => +x.id === +c);
        if (!ch) {
          ch = { id: +c, nom: "Chantier #" + c };
          results.push(ch);
        }
        ch.listBenne = uniqById([...(ch.listBenne || []), ...lb]);
      }
    } catch {}
    return uniqById(results);
  }
  try {
    const r = await rechercheClient(clientId || 0, 0, c);
    parseChantiers(r, results);
    if (Array.isArray(r?.data)) {
      for (const item of r.data) {
        if (Array.isArray(item?.listChantier))
          item.listChantier.forEach((ch) => {
            const n = normalizeChantier(ch);
            if (n) results.push(n);
          });
      }
    }
  } catch {}
  if (!results.length) {
    try {
      parseChantiers(
        await rechercheChantierLegacy(c, clientId || 0),
        results
      );
    } catch {}
  }
  return uniqById(results);
}
async function chargerBennes(chantierId, clientId) {
  const found = [];
  const chId = +chantierId || 0;
  if (!chId) return [];
  try {
    found.push(
      ...extractListBenne(await rechercheClient(clientId || 0, chId, ""))
    );
  } catch {}
  try {
    found.push(...extractListBenne(await getChantier(chId)));
  } catch {}
  try {
    found.push(...extractListBenne(await listeBenneChantier(chId)));
  } catch {}
  try {
    found.push(...extractListBenne(await rechercheBenne(chId, clientId || 0)));
  } catch {}
  return uniqById(found);
}

// ═══════════════════════════════════════════════════════
//  BATCH CREATION + PLANNING
// ═══════════════════════════════════════════════════════
async function createMouvement(item, planCfg) {
  const bd = item.benneData || {};
  const mouvement = {
    dateDemande: item.dateDemande,
    dateEnlevement: item.dateEnlevement,
    dateDemandeManuel: item.dateDemande,
    heure: "",
    clefBenneChantiers: String(item.benne.id),
    clefClient: String(item.clientId),
    clefChauffeur: String(item.chauffeurId || planCfg.chauffeurId),
    operation: String(item.operationId),
    clefExutoire: String(bd.exu ? bd.exu.id : item.benne.exu?.id || 0),
    clefSitePrest: String(CLEF_SITE),
    clefSiteCA: String(CLEF_SITE),
    typeDemande: { id: 1 },
    infoFact: "",
    infoSup: item.infoSup || "",
    listMouvSupp: [],
    listeMouvementsSupplementaires: [],
    bon: {
      numBonManuel: "",
      numBSDD: "",
      axeAnalytiqueLigneArticle: "",
      axeAnalytiqueLignePrestation: "",
      lignePrestationContrat: { id: 0 },
      numScelle: null,
    },
    bonRemorque: { id: 0 },
    positionRemorque: 0,
    clefProgram: "0",
    isProgram: false,
    listeClesBennesDuGroupe: [],
    user: String(CLEF_USER),
    facturation: "0",
    important: item.important || false,
    duree: String(item.duree || 7),
    chauffeur: { id: item.chauffeurId || planCfg.chauffeurId },
    listePersonnelParPoste: [],
    camion: { id: item.camionId || planCfg.camionId },
    periode: { id: item.periodeId || planCfg.periodeId },
    auPlusTard: false,
    contrat: { id: 0 },
    articleMouv: { id: item.benne.art?.id || 0 },
    nomclass: "Mouvement",
    camionRemorque: { id: 0 },
    qtePrevisionnelle: 0,
  };
  const res = await api("DBUpdateMouv", "Recylog", {
    MOUVEMENT: mouvement,
    NOM_USER,
    MOUV_PROGRAMME: { typeParam: "boolean", valeur: false },
    USER: { typeParam: "int", valeur: CLEF_USER },
    SITE: { typeParam: "int", valeur: CLEF_SITE },
    CLEF_BON: { typeParam: "int", valeur: 0 },
  });
  if (res?.message?.includes("non authentifié")) throw new Error(res.message);
  let bonId = 0,
    bonNum = "",
    clefMouv = null;
  if (Array.isArray(res?.data)) {
    if (typeof res.data[1] === "string") bonNum = res.data[1];
    if (res.data[2] && typeof res.data[2] === "object") {
      if (res.data[2].clefBon) bonId = res.data[2].clefBon;
      if (res.data[2].clefMouvCourant) clefMouv = res.data[2].clefMouvCourant;
    }
  }
  const scan = (o) => {
    if (!o || typeof o !== "object") return;
    if (o.clefBon) bonId = o.clefBon;
    if (!bonNum && o.bon?.numBon) bonNum = o.bon.numBon;
    if (!bonId && o.bon?.id) bonId = o.bon.id;
    if (!clefMouv && o.clefMouvCourant) clefMouv = o.clefMouvCourant;
  };
  [res, res?.MOUVEMENT, res?.data].forEach(scan);
  if (Array.isArray(res?.data)) res.data.forEach(scan);
  return { bonId, bonNum, clefMouv, raw: res };
}

async function affecterPlanning(results, planCfg) {
  const dateIso = planCfg.dateIntervention;
  const planningRes = await listPlanningDate(dateIso);
  const rawData = planningRes?.data;
  if (!Array.isArray(rawData) || rawData.length < 2)
    throw new Error("Format planning inattendu");
  const camions = rawData[0] || [],
    mouvements = rawData[1] || [];
  const newMouvIds = new Set();
  for (const r of results) {
    if (!r.success) continue;
    let target = null;
    if (r.clefMouv)
      target = mouvements.find((m) => +m.id === +r.clefMouv);
    if (!target && r.bonId)
      target = mouvements.find((m) => m.bon?.id && +m.bon.id === +r.bonId);
    if (!target && r.bonNum)
      target = mouvements.find(
        (m) => m.bon?.numBon && String(m.bon.numBon) === String(r.bonNum)
      );
    if (!target && r.benneId)
      target = mouvements.find(
        (m) => m.benne?.id && +m.benne.id === +r.benneId
      );
    if (target) {
      newMouvIds.add(+target.id);
      r.matchedMouvId = +target.id;
      r.planned = true;
    } else {
      r.planned = false;
      r.planError = "Non trouvé dans le planning";
    }
  }
  if (newMouvIds.size === 0) return;
  // For multi-agent: use per-item chauffeur/camion/period if available
  let maxPos = -1;
  for (const m of mouvements) {
    const p = +(m.positionPlanning ?? 0);
    if (p > maxPos) maxPos = p;
  }
  const mouvRows = [];
  let posCounter = maxPos + 1;
  for (const m of mouvements) {
    const mId = +m.id;
    if (newMouvIds.has(mId)) {
      // Find the matching result to get per-item agent info
      const matchedResult = results.find((r) => r.matchedMouvId === mId);
      const chId = String(
        matchedResult?.item?.chauffeurId || planCfg.chauffeurId
      );
      const camId = String(
        matchedResult?.item?.camionId || planCfg.camionId
      );
      const perId = String(
        matchedResult?.item?.periodeId || planCfg.periodeId
      );
      mouvRows.push([
        chId,
        posCounter++,
        String(mId),
        camId,
        perId,
        "0",
        dateIso,
        "0",
        "0",
        "0",
      ]);
    } else {
      mouvRows.push([
        m.chauffeur ? String(m.chauffeur.id) : "0",
        +(m.positionPlanning ?? 0),
        String(mId),
        m.camion ? String(m.camion.id) : "0",
        m.periode ? String(m.periode.id) : "0",
        m.parking ? String(m.parking.id) : "0",
        dateIso,
        "0",
        "0",
        "0",
      ]);
    }
  }
  const truckRows = [];
  for (const c of camions) {
    if (!c || !c.id) continue;
    truckRows.push([
      c.chauffeur ? String(c.chauffeur.id) : "0",
      String(c.id),
      dateIso,
      c.periode ? String(c.periode.id) : "1",
    ]);
  }
  const now = new Date(),
    pad = (n) => String(n).padStart(2, "0");
  const dateFr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  await apiRaw({
    servlet: "DBUpdatePlanningMouv",
    module: "Ecobennes",
    type: "liste",
    compression: "true",
    data: [
      ["DBUpdatePlanningMouv"],
      mouvRows,
      truckRows,
      String(CLEF_USER),
      dateFr,
      {
        typeParam: "dateTime",
        valeur: `${dateFr} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      },
      [],
      { typeParam: "boolean", valeur: false },
    ],
  });
}

// ═══════════════════════════════════════════════════════
//  PLANNING DATA
// ═══════════════════════════════════════════════════════
function mergePlanningData(normalRaw, histoRaw) {
  if (!normalRaw?.data) return normalRaw;
  if (!histoRaw?.data?.[1]) return normalRaw;
  const normalMouvs = normalRaw.data[1] || [];
  const normalIds = new Set();
  for (const m of normalMouvs) {
    if (m?.id) normalIds.add(m.id);
  }
  const histoMouvs = histoRaw.data[1] || [];
  const histoOnly = [];
  for (const hm of histoMouvs) {
    if (!hm?.id) continue;
    if (normalIds.has(hm.id)) {
      const nm = normalMouvs.find((m) => m.id === hm.id);
      if (nm && !nm.chauffeur?.id && hm.chauffeur?.id) {
        nm.chauffeur = hm.chauffeur;
        nm.camion = hm.camion;
        nm.periode = hm.periode;
        nm._fromHisto = true;
      }
    } else {
      hm._fromHisto = true;
      histoOnly.push(hm);
    }
  }
  const merged = {
    message: normalRaw.message,
    data: [...normalRaw.data],
    continueProcess: normalRaw.continueProcess,
  };
  merged.data[1] = [...normalMouvs, ...histoOnly];
  const normalCamions = normalRaw.data[0] || [];
  const histoCamions = histoRaw.data[0] || [];
  const camKey = (c) => `${c?.id}-${c?.periode?.id}`;
  const normalCamKeys = new Set(normalCamions.map(camKey));
  const extraCamions = histoCamions.filter(
    (c) => c?.id && !normalCamKeys.has(camKey(c))
  );
  merged.data[0] = [...normalCamions, ...extraCamions];
  return merged;
}

function processPlanningData(raw) {
  if (!raw?.data || !Array.isArray(raw.data) || raw.data.length < 2)
    return { chauffeurs: [], mouvements: [], camions: [] };
  const camionsRaw = raw.data[0] || [];
  const mouvsRaw = raw.data[1] || [];
  const chauffMap = new Map();
  for (const c of camionsRaw) {
    if (!c || !c.chauffeur || !c.chauffeur.id) continue;
    if (c.periode && +c.periode.id !== 1) continue;
    const ch = c.chauffeur;
    if (!chauffMap.has(ch.id)) {
      chauffMap.set(ch.id, {
        id: ch.id,
        nom: ch.nom || "",
        prenom: ch.prenom || "",
        label: `${ch.prenom || ""} ${ch.nom || ""}`.trim(),
        couleur: ch.couleur || "CCCCCC",
        camionId: c.id,
        camionImmat: c.immatriculation || c.numParc || "",
      });
    }
  }
  const camionMap = new Map();
  for (const c of camionsRaw) {
    if (!c || !c.id || !c.immatriculation) continue;
    if (c.periode && +c.periode.id !== 1) continue;
    if (!camionMap.has(c.id))
      camionMap.set(c.id, {
        id: c.id,
        immat: c.immatriculation,
        numParc: c.numParc || "",
      });
  }
  const camions = [...camionMap.values()];
  const mouvements = (mouvsRaw || [])
    .map((m) => {
      if (!m || !m.id) return null;
      const chNom = m.chantier
        ? m.chantier.numChantier || m.chantier.nom || ""
        : "";
      const artLib = m.benne?.art?.libelle || "";
      const opId = +(m.operation || 0);
      const op = OPERATIONS.find((o) => o.id === opId) || OPERATIONS[0];
      let chauffeurId = m.chauffeur?.id || 0;
      let chauffeurNom = m.chauffeur
        ? `${m.chauffeur.prenom || ""} ${m.chauffeur.nom || ""}`.trim()
        : "";
      let camionId = m.camion?.id || 0;
      let camionImmat = m.camion?.immatriculation || "";
      let periodeId = m.periode?.id || 0;
      let usedFallback = m._fromHisto || false;
      if (!chauffeurId && m.benne?.dernierChauff?.id) {
        const dc = m.benne.dernierChauff;
        chauffeurId = dc.id;
        chauffeurNom = `${dc.prenom || ""} ${dc.nom || ""}`.trim();
        periodeId = periodeId || 1;
        usedFallback = true;
        if (!chauffMap.has(dc.id)) {
          chauffMap.set(dc.id, {
            id: dc.id,
            nom: dc.nom || "",
            prenom: dc.prenom || "",
            label: chauffeurNom,
            couleur: dc.couleur || "AAAAAA",
            camionId: 0,
            camionImmat: "",
          });
        }
      }
      const info = (m.infoSup || "").trim();
      const isSecours = /secours/i.test(info);
      const fillMatch = info.match(/^(\d{1,3})\s*%?$/);
      const fillPct = fillMatch ? +fillMatch[1] : null;
      return {
        id: m.id,
        chauffeurId,
        chauffeurNom,
        camionId,
        camionImmat,
        periodeId,
        chantierNom: chNom,
        chantierVille: m.chantier?.ville || "",
        clientNom: m.client?.nomClient || "",
        benneId: m.benne?.id || 0,
        article: artLib
          .replace(/ - Traitement.*$/, "")
          .replace(/ - Tonne$/, "")
          .replace(/ - Unité$/, ""),
        cubage: m.benne?.typeContenant?.cubage?.cubage || "",
        famille: m.benne?.typeContenant?.famille?.libelle || "",
        operation: op,
        operationId: opId,
        position: m.positionPlanning || 0,
        bonNum: m.bon?.numBon || "",
        infoSup: info,
        isRealise: m.isRealise || m.histo || false,
        usedFallback,
        isSecours,
        fillPct,
        parking: m.parking?.libelleObjetEntite
          ? m.parking.libelleObjetEntite.toLowerCase().includes("bloqu")
            ? "bloquee"
            : m.parking.libelleObjetEntite.toLowerCase().includes("dépôt") ||
                m.parking.libelleObjetEntite.toLowerCase().includes("depot")
              ? "depot"
              : ""
          : "",
        parkingLabel: m.parking?.libelleObjetEntite || "",
        isProgramme:
          m.benne?.clefProgram && m.benne.clefProgram !== "0",
      };
    })
    .filter(Boolean);
  const chauffeurs = [...chauffMap.values()].sort((a, b) =>
    a.nom.localeCompare(b.nom)
  );
  return { chauffeurs, mouvements, camions };
}

// ═══════════════════════════════════════════════════════
//  STORAGE
// ═══════════════════════════════════════════════════════
const FAVS_KEY = "ecorec-favorites";
const RECENT_KEY = "ecorec-recent";
function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVS_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveFavorites(favs) {
  localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
}
function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveRecent(list) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
}
function addToRecent(ch) {
  const recent = loadRecent().filter((r) => r.id !== ch.id);
  recent.unshift({
    id: ch.id,
    nom: ch.nom,
    clientId: ch.clientId || 0,
    adresse1: ch.adresse1 || "",
    cp: ch.cp || "",
    ville: ch.ville || "",
    ts: Date.now(),
  });
  saveRecent(recent);
}

// ═══════════════════════════════════════════════════════
//  DEMO DATA (used when API unavailable)
// ═══════════════════════════════════════════════════════
const DEMO_CHAUFFEURS = [
  { id: 6634, label: "BENEDDINE Mehdi", nom: "BENEDDINE", prenom: "Mehdi", couleur: "CCFFCC", camionId: 1453, camionImmat: "FT337XN" },
  { id: 2156, label: "AMICEL Philippe", nom: "AMICEL", prenom: "Philippe", couleur: "FFCCCC", camionId: 314, camionImmat: "DV549RV" },
  { id: 3624, label: "NOIZETTE Johann", nom: "NOIZETTE", prenom: "Johann", couleur: "CCCCFF", camionId: 910, camionImmat: "EZ103JD" },
  { id: 5067, label: "MARTIN Lucas", nom: "MARTIN", prenom: "Lucas", couleur: "FFFFCC", camionId: 911, camionImmat: "GH412TK" },
  { id: 402, label: "DUPONT Eric", nom: "DUPONT", prenom: "Eric", couleur: "FFCCFF", camionId: 3056, camionImmat: "AB123CD" },
];

const DEMO_CAMIONS = [
  { id: 1453, immat: "FT337XN" },
  { id: 314, immat: "DV549RV" },
  { id: 910, immat: "EZ103JD" },
  { id: 911, immat: "GH412TK" },
  { id: 3056, immat: "AB123CD" },
];

// ═══════════════════════════════════════════════════════
//  COMPONENTS
// ═══════════════════════════════════════════════════════

/* ---- ICON COMPONENTS ---- */
const Icon = ({ name, size = 16, className = "" }) => {
  const icons = {
    star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
    starFill: <path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
    search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    upload: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>,
    trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></>,
    check: <polyline points="20 6 9 17 4 12" />,
    x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    chevLeft: <polyline points="15 18 9 12 15 6" />,
    chevRight: <polyline points="9 18 15 12 9 6" />,
    clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    cart: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" /></>,
    zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
    download: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    refresh: <><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    users: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>,
    file: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {icons[name]}
    </svg>
  );
};

/* ---- SPINNER ---- */
const Spinner = ({ size = 20 }) => (
  <div
    className="inline-block rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin"
    style={{ width: size, height: size }}
  />
);

/* ---- BADGE ---- */
const Badge = ({ children, variant = "default", className = "" }) => {
  const variants = {
    default: "bg-zinc-700/60 text-zinc-300",
    gold: "bg-amber-900/40 text-amber-400",
    blue: "bg-blue-900/40 text-blue-400",
    green: "bg-emerald-900/40 text-emerald-400",
    red: "bg-red-900/40 text-red-400",
    purple: "bg-purple-900/40 text-purple-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

/* ── MAIN APP ── */
export default function EcorecBennesPRO() {
  const [tab, setTab] = useState("create");
  const [panier, setPanier] = useState([]);
  const [results, setResults] = useState([]);
  const [favorites, setFavorites] = useState(loadFavorites);
  const [chauffeurs, setChauffeurs] = useState(DEMO_CHAUFFEURS);
  const [camions, setCamions] = useState(DEMO_CAMIONS);
  const [planCfg, setPlanCfg] = useState({
    chauffeurId: DEMO_CHAUFFEURS[0].id,
    camionId: DEMO_CHAUFFEURS[0].camionId,
    periodeId: 1,
    dateIntervention: today(1),
  });

  const toggleFavorite = useCallback(
    (ch) => {
      setFavorites((prev) => {
        const exists = prev.some((f) => f.id === ch.id);
        const next = exists
          ? prev.filter((f) => f.id !== ch.id)
          : [
              ...prev,
              {
                id: ch.id,
                nom: ch.nom,
                clientId: ch.clientId || 0,
                adresse1: ch.adresse1 || "",
                cp: ch.cp || "",
                ville: ch.ville || "",
              },
            ];
        saveFavorites(next);
        return next;
      });
    },
    []
  );

  const addToPanier = useCallback((items) => {
    setPanier((prev) => [...prev, ...items]);
  }, []);

  const removeFromPanier = useCallback((id) => {
    setPanier((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200" style={{ fontFamily: "'Satoshi', 'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />

      {/* TOP BAR */}
      <header className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center px-5 gap-4 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-sm font-bold text-zinc-950">
            E
          </div>
          <div>
            <span className="font-bold text-sm tracking-wide text-amber-400">
              ECOREC BENNES PRO
            </span>
            <span className="text-zinc-600 text-xs ml-2 font-mono">v6.0</span>
          </div>
        </div>

        <nav className="flex bg-zinc-800/60 rounded-lg p-1 ml-6 gap-0.5">
          {[
            { id: "create", label: "Créer", icon: "plus" },
            { id: "import", label: "Import", icon: "upload" },
            {
              id: "panier",
              label: "Panier",
              icon: "cart",
              badge: panier.length,
            },
            { id: "results", label: "Résultats", icon: "zap" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all relative flex items-center gap-1.5 ${
                tab === t.id
                  ? "bg-zinc-700 text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon name={t.icon} size={13} />
              {t.label}
              {t.badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-1">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="flex-1" />
        <span className="text-xs text-zinc-600 font-mono">
          {NOM_USER} · Site {CLEF_SITE}
        </span>
      </header>

      {/* CONTENT */}
      <main className="max-w-6xl mx-auto p-5">
        {tab === "create" && (
          <CreateView
            favorites={favorites}
            toggleFavorite={toggleFavorite}
            addToPanier={addToPanier}
            chauffeurs={chauffeurs}
            camions={camions}
            planCfg={planCfg}
            setPlanCfg={setPlanCfg}
            setTab={setTab}
          />
        )}
        {tab === "import" && (
          <ImportView
            addToPanier={addToPanier}
            chauffeurs={chauffeurs}
            setTab={setTab}
          />
        )}
        {tab === "panier" && (
          <PanierView
            panier={panier}
            setPanier={setPanier}
            removeFromPanier={removeFromPanier}
            chauffeurs={chauffeurs}
            camions={camions}
            planCfg={planCfg}
            setPlanCfg={setPlanCfg}
            setTab={setTab}
            setResults={setResults}
          />
        )}
        {tab === "results" && (
          <ResultsView results={results} setTab={setTab} />
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  CREATE VIEW
// ═══════════════════════════════════════════════════════
function CreateView({
  favorites,
  toggleFavorite,
  addToPanier,
  chauffeurs,
  camions,
  planCfg,
  setPlanCfg,
  setTab,
}) {
  const [step, setStep] = useState("search"); // search | bennes | config
  const [clientId, setClientId] = useState(62131);
  const [critere, setCritere] = useState("");
  const [searching, setSearching] = useState(false);
  const [chantiers, setChantiers] = useState([]);
  const [selectedChantier, setSelectedChantier] = useState(null);
  const [bennes, setBennes] = useState([]);
  const [selectedBennes, setSelectedBennes] = useState([]);
  const [loadingBennes, setLoadingBennes] = useState(false);
  const [error, setError] = useState(null);
  const [recent] = useState(loadRecent);

  // Config state
  const [operationId, setOperationId] = useState(2);
  const [dateDemande, setDateDemande] = useState(today());
  const [dateEnlevement, setDateEnlevement] = useState(today(1));
  const [duree, setDuree] = useState(7);
  const [important, setImportant] = useState(false);
  const [infoSup, setInfoSup] = useState("");
  const [perItemAgents, setPerItemAgents] = useState(false);
  const [agentMap, setAgentMap] = useState({});

  const doSearch = async () => {
    setSearching(true);
    setError(null);
    setChantiers([]);
    try {
      const res = await chercherChantiers(critere, clientId);
      if (res.length === 0) setError("Aucun chantier trouvé.");
      else if (res.length === 1) await doSelectChantier(res[0]);
      else setChantiers(res);
    } catch (e) {
      setError(e.message);
    }
    setSearching(false);
  };

  const doSelectChantier = async (ch) => {
    setSelectedChantier(ch);
    setSelectedBennes([]);
    setLoadingBennes(true);
    addToRecent(ch);
    let b = ch.listBenne || [];
    if (!b.length) {
      try {
        b = await chargerBennes(ch.id, clientId);
      } catch {}
    }
    setBennes(b);
    setLoadingBennes(false);
    setStep("bennes");
  };

  const toggleBenne = (b) => {
    setSelectedBennes((prev) =>
      prev.some((sb) => sb.id === b.id)
        ? prev.filter((sb) => sb.id !== b.id)
        : [...prev, b]
    );
  };

  const doAddToPanier = () => {
    const op = OPERATIONS.find((o) => o.id === operationId);
    const items = selectedBennes.map((b) => ({
      id: `${Date.now()}-${b.id}-${Math.random().toString(36).slice(2, 6)}`,
      clientId,
      chantier: {
        id: selectedChantier.id,
        nom: selectedChantier.nom,
      },
      benne: { ...b },
      benneData: b,
      operationId,
      operationNom: op?.nom || "",
      operationIcon: op?.icon || "",
      dateDemande,
      dateEnlevement,
      duree,
      important,
      infoSup,
      chauffeurId: perItemAgents ? agentMap[b.id]?.chauffeurId || 0 : 0,
      camionId: perItemAgents ? agentMap[b.id]?.camionId || 0 : 0,
      periodeId: perItemAgents ? agentMap[b.id]?.periodeId || 0 : 0,
    }));
    addToPanier(items);
    setSelectedBennes([]);
    setSelectedChantier(null);
    setBennes([]);
    setCritere("");
    setInfoSup("");
    setStep("search");
    setTab("panier");
  };

  const isFav = (id) => favorites.some((f) => f.id === id);

  return (
    <div className="space-y-4">
      {/* FAVORITES + RECENT */}
      {step === "search" && (favorites.length > 0 || recent.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {favorites.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="starFill" size={14} className="text-amber-400" />
                <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Favoris
                </h3>
              </div>
              <div className="space-y-1.5">
                {favorites.map((f) => (
                  <button
                    key={f.id}
                    onClick={() =>
                      doSelectChantier({
                        ...f,
                        listBenne: [],
                      })
                    }
                    className="w-full text-left px-3 py-2.5 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 border border-transparent hover:border-amber-500/30 transition-all group flex items-center gap-3"
                  >
                    <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-zinc-200 truncate">
                        {f.nom}
                      </div>
                      <div className="text-xs text-zinc-500">
                        ID {f.id}
                        {f.ville ? ` · ${f.ville}` : ""}
                      </div>
                    </div>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(f);
                      }}
                      className="text-amber-400/50 hover:text-amber-400 transition-colors p-1"
                    >
                      <Icon name="starFill" size={12} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="clock" size={14} className="text-zinc-500" />
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  Récents
                </h3>
              </div>
              <div className="space-y-1.5">
                {recent.slice(0, 5).map((r) => (
                  <button
                    key={r.id}
                    onClick={() =>
                      doSelectChantier({ ...r, listBenne: [] })
                    }
                    className="w-full text-left px-3 py-2.5 rounded-lg bg-zinc-800/40 hover:bg-zinc-800 border border-transparent hover:border-zinc-600 transition-all flex items-center gap-3"
                  >
                    <div className="w-2 h-2 rounded-full bg-zinc-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-zinc-300 truncate">
                        {r.nom}
                      </div>
                      <div className="text-xs text-zinc-600">
                        ID {r.id}{r.ville ? ` · ${r.ville}` : ""}
                      </div>
                    </div>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(r);
                      }}
                      className={`p-1 transition-colors ${isFav(r.id) ? "text-amber-400" : "text-zinc-700 hover:text-amber-400/60"}`}
                    >
                      <Icon name={isFav(r.id) ? "starFill" : "star"} size={12} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 1: SEARCH */}
      {step === "search" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center text-xs font-bold">
              1
            </div>
            <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">
              Rechercher un chantier
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wide">
                Client ID
              </label>
              <input
                type="number"
                value={clientId}
                onChange={(e) => setClientId(+e.target.value || 0)}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wide">
                Critère (nom ou ID)
              </label>
              <input
                type="text"
                value={critere}
                onChange={(e) => setCritere(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
                placeholder="DECHETTERIE, 9970..."
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 outline-none transition-all"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={doSearch}
                disabled={searching}
                className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {searching ? (
                  <Spinner size={14} />
                ) : (
                  <Icon name="search" size={14} />
                )}
                Rechercher
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-3 px-3 py-2.5 bg-amber-900/20 border border-amber-700/40 rounded-lg text-sm text-amber-400">
              {error}
            </div>
          )}

          {chantiers.length > 0 && (
            <div className="mt-4 space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {chantiers.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => doSelectChantier(ch)}
                  className="w-full text-left px-4 py-3 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 hover:border-amber-500/30 transition-all flex items-center gap-3 group"
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: `hsl(${chantierHue(ch.nom)}, 50%, 60%)`,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-zinc-200 truncate">
                      {ch.nom || `#${ch.id}`}
                    </div>
                    <div className="text-xs text-zinc-500">
                      ID {ch.id}{" "}
                      {[ch.adresse1, ch.cp, ch.ville]
                        .filter(Boolean)
                        .join(" ")}
                    </div>
                  </div>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(ch);
                    }}
                    className={`p-1.5 rounded-md transition-all ${isFav(ch.id) ? "text-amber-400" : "text-zinc-700 hover:text-amber-400/60"}`}
                  >
                    <Icon
                      name={isFav(ch.id) ? "starFill" : "star"}
                      size={14}
                    />
                  </span>
                  <Icon
                    name="chevRight"
                    size={14}
                    className="text-zinc-600 group-hover:text-amber-400 transition-colors"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 2: BENNES */}
      {step === "bennes" && selectedChantier && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center text-xs font-bold">
              2
            </div>
            <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">
              Sélectionner les bennes
            </h2>
          </div>
          {/* Chantier info */}
          <div className="px-4 py-3 bg-emerald-900/20 border border-emerald-700/30 rounded-lg mb-4 flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{
                backgroundColor: `hsl(${chantierHue(selectedChantier.nom)}, 50%, 60%)`,
              }}
            />
            <div>
              <div className="text-sm font-bold text-emerald-300">
                {selectedChantier.nom}
              </div>
              <div className="text-xs text-zinc-500">
                ID {selectedChantier.id} · {bennes.length} benne(s)
              </div>
            </div>
            <button
              onClick={() => toggleFavorite(selectedChantier)}
              className={`ml-auto p-2 rounded-md transition-all ${isFav(selectedChantier.id) ? "text-amber-400 bg-amber-400/10" : "text-zinc-600 hover:text-amber-400"}`}
            >
              <Icon
                name={isFav(selectedChantier.id) ? "starFill" : "star"}
                size={16}
              />
            </button>
          </div>

          {loadingBennes ? (
            <div className="text-center py-10">
              <Spinner size={24} />
              <p className="text-xs text-zinc-500 mt-2">
                Chargement des bennes...
              </p>
            </div>
          ) : bennes.length === 0 ? (
            <div className="text-center py-10 text-zinc-500 text-sm">
              Aucune benne trouvée.
            </div>
          ) : (
            <>
              {/* Select bar */}
              <div className="flex items-center gap-3 px-1 py-2 border-b border-zinc-800 mb-2">
                <input
                  type="checkbox"
                  checked={selectedBennes.length === bennes.length}
                  onChange={(e) =>
                    setSelectedBennes(e.target.checked ? [...bennes] : [])
                  }
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
                <span className="text-xs text-zinc-500">
                  {selectedBennes.length}/{bennes.length} sélectionnée(s)
                </span>
              </div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {bennes.map((b) => {
                  const sel = selectedBennes.some((sb) => sb.id === b.id);
                  const art = b.art
                    ? b.art.libelle || b.art.lib || ""
                    : "";
                  const fam =
                    b.typeContenant?.famille?.libelle || "";
                  const cub =
                    b.typeContenant?.cubage?.cubage || "";
                  return (
                    <div
                      key={b.id}
                      onClick={() => toggleBenne(b)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${
                        sel
                          ? "bg-amber-500/10 border-amber-500/40"
                          : "bg-zinc-800/40 border-zinc-700/40 hover:border-zinc-600"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={() => toggleBenne(b)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 accent-amber-500 cursor-pointer flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-zinc-200">
                          {b.id}
                          {b.NumBenne ? ` — ${b.NumBenne}` : ""}
                          {art ? (
                            <span className="text-zinc-400 font-normal">
                              {" "}
                              · {art}
                            </span>
                          ) : null}
                        </div>
                        {fam && (
                          <div className="text-xs text-zinc-500">
                            {fam}
                            {cub ? ` · ${cub}m³` : ""}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="flex justify-between mt-4 gap-3">
            <button
              onClick={() => {
                setStep("search");
                setSelectedChantier(null);
                setBennes([]);
                setSelectedBennes([]);
              }}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-semibold transition-all border border-zinc-700"
            >
              <Icon name="chevLeft" size={14} className="inline mr-1" />
              Chantier
            </button>
            <button
              onClick={() => selectedBennes.length > 0 && setStep("config")}
              disabled={!selectedBennes.length}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Configurer {selectedBennes.length} benne(s)
              <Icon name="chevRight" size={14} className="inline ml-1" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: CONFIG */}
      {step === "config" && selectedChantier && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center text-xs font-bold">
              3
            </div>
            <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">
              Configurer — {selectedBennes.length} benne(s) ·{" "}
              {selectedChantier.nom}
            </h2>
          </div>

          {/* Operation */}
          <label className="block text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wide">
            Opération
          </label>
          <div className="flex gap-2 mb-4">
            {OPERATIONS.map((op) => (
              <button
                key={op.id}
                onClick={() => setOperationId(op.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                  operationId === op.id
                    ? "text-zinc-950 border-transparent"
                    : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500"
                }`}
                style={
                  operationId === op.id
                    ? { backgroundColor: op.color, color: "#fff" }
                    : {}
                }
              >
                {op.icon} {op.nom}
              </button>
            ))}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wide">
                Date demande
              </label>
              <input
                type="date"
                value={dateDemande}
                onChange={(e) => setDateDemande(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wide">
                Date enlèvement
              </label>
              <input
                type="date"
                value={dateEnlevement}
                onChange={(e) => setDateEnlevement(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wide">
                Durée (jours)
              </label>
              <input
                type="number"
                value={duree}
                onChange={(e) => setDuree(+e.target.value || 7)}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wide">
                Important
              </label>
              <select
                value={important ? "1" : "0"}
                onChange={(e) => setImportant(e.target.value === "1")}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
              >
                <option value="0">Non</option>
                <option value="1">Oui</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wide">
                Info supplémentaire
              </label>
              <input
                type="text"
                value={infoSup}
                onChange={(e) => setInfoSup(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
                placeholder="Optionnel..."
              />
            </div>
          </div>

          {/* Multi-agent toggle */}
          <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Icon name="users" size={14} className="text-blue-400" />
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">
                  Affectation par benne
                </span>
              </div>
              <button
                onClick={() => setPerItemAgents(!perItemAgents)}
                className={`w-10 h-5 rounded-full transition-all relative ${
                  perItemAgents ? "bg-amber-500" : "bg-zinc-600"
                }`}
              >
                <div
                  className={`absolute w-4 h-4 bg-white rounded-full top-0.5 transition-all ${
                    perItemAgents ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            {perItemAgents && (
              <div className="space-y-2 mt-3">
                {selectedBennes.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-2 bg-zinc-900/60 rounded-lg px-3 py-2"
                  >
                    <span className="text-xs font-semibold text-zinc-300 min-w-[100px] truncate">
                      {b.NumBenne || `#${b.id}`}
                    </span>
                    <select
                      value={agentMap[b.id]?.chauffeurId || ""}
                      onChange={(e) =>
                        setAgentMap((prev) => ({
                          ...prev,
                          [b.id]: {
                            ...(prev[b.id] || {}),
                            chauffeurId: +e.target.value || 0,
                            camionId:
                              chauffeurs.find(
                                (c) => c.id === +e.target.value
                              )?.camionId || 0,
                          },
                        }))
                      }
                      className="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 outline-none"
                    >
                      <option value="">— Chauffeur —</option>
                      {chauffeurs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={agentMap[b.id]?.periodeId || ""}
                      onChange={(e) =>
                        setAgentMap((prev) => ({
                          ...prev,
                          [b.id]: {
                            ...(prev[b.id] || {}),
                            periodeId: +e.target.value || 1,
                          },
                        }))
                      }
                      className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 outline-none w-28"
                    >
                      {PERIODES.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-between gap-3">
            <button
              onClick={() => setStep("bennes")}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-semibold transition-all border border-zinc-700"
            >
              <Icon name="chevLeft" size={14} className="inline mr-1" />
              Bennes
            </button>
            <button
              onClick={doAddToPanier}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
            >
              <Icon name="cart" size={14} />
              Ajouter au panier ({selectedBennes.length})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  IMPORT VIEW
// ═══════════════════════════════════════════════════════
function ImportView({ addToPanier, chauffeurs, setTab }) {
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  const SAMPLE_JSON = JSON.stringify(
    {
      planning: [
        {
          chantierId: 9970,
          clientId: 62131,
          chantierNom: "DECHETTERIE DE NANCY",
          benneId: 12345,
          operation: 2,
          dateEnlevement: today(1),
          chauffeurId: 6634,
          periodeId: 1,
          duree: 7,
          infoSup: "",
        },
        {
          chantierId: 9970,
          clientId: 62131,
          chantierNom: "DECHETTERIE DE NANCY",
          benneId: 12346,
          operation: 1,
          dateEnlevement: today(1),
          chauffeurId: 2156,
          periodeId: 2,
          duree: 5,
          infoSup: "Urgent",
        },
      ],
    },
    null,
    2
  );

  const doImport = () => {
    setImportError(null);
    setImportResult(null);
    try {
      const data = JSON.parse(importText);
      const items = data.planning || data.items || data;
      if (!Array.isArray(items))
        throw new Error(
          "Format invalide. Attendu: { planning: [...] } ou un tableau."
        );
      const panierItems = items.map((item, i) => {
        const opId = item.operation || item.operationId || 2;
        const op = OPERATIONS.find((o) => o.id === opId) || OPERATIONS[0];
        return {
          id: `import-${Date.now()}-${i}`,
          clientId: item.clientId || 0,
          chantier: {
            id: item.chantierId || item.chantier?.id || 0,
            nom:
              item.chantierNom ||
              item.chantier?.nom ||
              `Chantier #${item.chantierId || "?"}`,
          },
          benne: {
            id: item.benneId || item.benne?.id || 0,
            NumBenne: item.numBenne || item.benne?.NumBenne || "",
            art: item.art || item.benne?.art || null,
            exu: item.exu || item.benne?.exu || null,
          },
          benneData: item.benne || {},
          operationId: opId,
          operationNom: op.nom,
          operationIcon: op.icon,
          dateDemande: item.dateDemande || today(),
          dateEnlevement: item.dateEnlevement || today(1),
          duree: item.duree || 7,
          important: item.important || false,
          infoSup: item.infoSup || "",
          chauffeurId: item.chauffeurId || 0,
          camionId:
            item.camionId ||
            chauffeurs.find((c) => c.id === item.chauffeurId)?.camionId ||
            0,
          periodeId: item.periodeId || 1,
        };
      });
      addToPanier(panierItems);
      setImportResult(`${panierItems.length} opération(s) ajoutée(s) au panier.`);
      setImportText("");
    } catch (e) {
      setImportError(e.message);
    }
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImportText(ev.target.result);
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="upload" size={16} className="text-blue-400" />
          <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">
            Importer un planning JSON
          </h2>
        </div>

        <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
          Importez un fichier JSON pour créer automatiquement un ensemble de
          bennes attribuées à différents agents. Le format attendu est un
          tableau d'opérations avec chantierId, benneId, chauffeurId, etc.
        </p>

        <div className="flex gap-2 mb-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-semibold transition-all border border-zinc-700 flex items-center gap-2"
          >
            <Icon name="file" size={14} />
            Charger un fichier
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFile}
          />
          <button
            onClick={() => setImportText(SAMPLE_JSON)}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-semibold transition-all border border-zinc-700"
          >
            Charger l'exemple
          </button>
        </div>

        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          className="w-full h-64 px-3 py-3 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-200 font-mono focus:border-amber-500 outline-none resize-none leading-relaxed"
          placeholder='{\n  "planning": [\n    {\n      "chantierId": 9970,\n      "clientId": 62131,\n      "benneId": 12345,\n      "operation": 2,\n      "chauffeurId": 6634,\n      ...\n    }\n  ]\n}'
        />

        {importError && (
          <div className="mt-3 px-3 py-2.5 bg-red-900/20 border border-red-700/40 rounded-lg text-sm text-red-400">
            {importError}
          </div>
        )}
        {importResult && (
          <div className="mt-3 px-3 py-2.5 bg-emerald-900/20 border border-emerald-700/40 rounded-lg text-sm text-emerald-400 flex items-center justify-between">
            <span>
              <Icon name="check" size={14} className="inline mr-1" />
              {importResult}
            </span>
            <button
              onClick={() => setTab("panier")}
              className="text-xs font-bold text-amber-400 hover:text-amber-300"
            >
              Voir le panier →
            </button>
          </div>
        )}

        <div className="flex justify-end mt-3">
          <button
            onClick={doImport}
            disabled={!importText.trim()}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Icon name="download" size={14} />
            Importer dans le panier
          </button>
        </div>
      </div>

      {/* FORMAT REFERENCE */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
          Référence du format JSON
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-xs font-semibold text-zinc-400 mb-2">
              Champs par opération
            </h4>
            <div className="space-y-1">
              {[
                ["chantierId", "int", "Requis — ID du chantier"],
                ["clientId", "int", "Requis — ID du client"],
                ["benneId", "int", "Requis — ID de la benne"],
                ["operation", "int", "2=Rotation, 1=Retrait, 8=Vidage"],
                ["chauffeurId", "int", "ID du chauffeur"],
                ["periodeId", "int", "1=Matin, 2=AM, 3=Soir"],
                ["dateEnlevement", "date", "YYYY-MM-DD"],
                ["duree", "int", "Durée en jours (défaut 7)"],
                ["infoSup", "str", "Infos complémentaires"],
                ["important", "bool", "Priorité (défaut false)"],
              ].map(([name, type, desc]) => (
                <div key={name} className="flex gap-2 text-xs">
                  <code className="text-amber-400 font-mono w-28 flex-shrink-0">
                    {name}
                  </code>
                  <span className="text-zinc-600 w-10">{type}</span>
                  <span className="text-zinc-400">{desc}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-400 mb-2">
              Chauffeurs disponibles
            </h4>
            <div className="space-y-1">
              {chauffeurs.map((c) => (
                <div key={c.id} className="flex gap-2 text-xs">
                  <code className="text-blue-400 font-mono w-12">
                    {c.id}
                  </code>
                  <span className="text-zinc-300">{c.label}</span>
                  <span className="text-zinc-600">{c.camionImmat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  PANIER VIEW
// ═══════════════════════════════════════════════════════
function PanierView({
  panier,
  setPanier,
  removeFromPanier,
  chauffeurs,
  camions,
  planCfg,
  setPlanCfg,
  setTab,
  setResults,
}) {
  const [executing, setExecuting] = useState(false);
  const [progress, setProgress] = useState({ step: "", pct: 0, detail: "" });

  const grouped = useMemo(() => {
    const g = {};
    panier.forEach((item) => {
      const k = item.chantier.id;
      if (!g[k]) g[k] = { chantier: item.chantier, items: [] };
      g[k].items.push(item);
    });
    return g;
  }, [panier]);

  const executeBatch = async () => {
    setExecuting(true);
    const batchResults = [];
    const total = panier.length;
    // Step 1: Create movements
    for (let i = 0; i < total; i++) {
      const item = panier[i];
      setProgress({
        step: "Création des mouvements",
        pct: Math.round(((i + 1) / total) * 50),
        detail: `Mouvement ${i + 1}/${total} — Benne ${item.benne.id}`,
      });
      try {
        const r = await createMouvement(item, planCfg);
        batchResults.push({
          success: true,
          item,
          benneId: item.benne.id,
          bonId: r.bonId,
          bonNum: r.bonNum,
          clefMouv: r.clefMouv,
          planned: false,
          planError: null,
        });
      } catch (e) {
        batchResults.push({
          success: false,
          item,
          benneId: item.benne.id,
          error: e.message,
          planned: false,
        });
      }
    }
    // Step 2: Assign to planning
    setProgress({
      step: "Affectation au planning",
      pct: 70,
      detail: "Envoi...",
    });
    try {
      await affecterPlanning(batchResults, planCfg);
      setProgress({ step: "Terminé", pct: 100, detail: "" });
    } catch (e) {
      batchResults.forEach((r) => {
        if (r.success && !r.planned) r.planError = e.message;
      });
      setProgress({
        step: "Terminé avec erreurs",
        pct: 100,
        detail: e.message,
      });
    }
    setResults(batchResults);
    setPanier([]);
    setExecuting(false);
    setTab("results");
  };

  if (executing) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
          <div className="text-2xl mb-3">
            <Icon name="zap" size={32} className="text-amber-400 mx-auto" />
          </div>
          <h2 className="text-lg font-bold text-zinc-200 mb-2">
            {progress.step}
          </h2>
          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-300 rounded-full"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500">{progress.detail}</p>
        </div>
      </div>
    );
  }

  if (panier.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4 opacity-30">🛒</div>
        <h2 className="text-lg font-bold text-zinc-400 mb-2">Panier vide</h2>
        <p className="text-sm text-zinc-600 mb-4">
          Ajoutez des bennes depuis l'onglet Créer ou Importer
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => setTab("create")}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg text-sm font-bold transition-all"
          >
            <Icon name="plus" size={14} className="inline mr-1" />
            Créer
          </button>
          <button
            onClick={() => setTab("import")}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-semibold transition-all border border-zinc-700"
          >
            <Icon name="upload" size={14} className="inline mr-1" />
            Importer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ITEMS */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">
            Panier — {panier.length} opération(s)
          </h2>
          <button
            onClick={() => {
              if (confirm("Vider le panier ?")) setPanier([]);
            }}
            className="px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-900/20 rounded-lg transition-all"
          >
            <Icon name="trash" size={12} className="inline mr-1" />
            Tout vider
          </button>
        </div>

        {Object.entries(grouped).map(([, g]) => (
          <div key={g.chantier.id} className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  backgroundColor: `hsl(${chantierHue(g.chantier.nom)}, 50%, 60%)`,
                }}
              />
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">
                {g.chantier.nom}
              </span>
            </div>
            <div className="space-y-1.5">
              {g.items.map((item) => {
                const art = item.benne.art
                  ? item.benne.art.libelle || item.benne.art.lib || ""
                  : "";
                const assignedChauffeur = chauffeurs.find(
                  (c) => c.id === item.chauffeurId
                );
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-2.5 bg-zinc-800/50 border border-zinc-700/40 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-zinc-200">
                        {item.operationIcon} Benne {item.benne.id}
                        {item.benne.NumBenne
                          ? ` — ${item.benne.NumBenne}`
                          : ""}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {art || "—"}
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-wrap items-center">
                      <Badge variant="gold">{item.operationNom}</Badge>
                      <Badge variant="blue">
                        {fmtDate(item.dateEnlevement)}
                      </Badge>
                      {item.important && <Badge variant="red">Important</Badge>}
                      {item.duree && (
                        <Badge variant="green">{item.duree}j</Badge>
                      )}
                      {assignedChauffeur && (
                        <Badge variant="purple">
                          {assignedChauffeur.label}
                        </Badge>
                      )}
                    </div>
                    <button
                      onClick={() => removeFromPanier(item.id)}
                      className="text-zinc-600 hover:text-red-400 transition-colors p-1"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* PLANNING CONFIG */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider mb-4">
          Affectation planning (par défaut)
        </h2>
        <p className="text-xs text-zinc-500 mb-3">
          Les bennes sans affectation individuelle utiliseront ce chauffeur/camion par défaut.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wide">
              Chauffeur
            </label>
            <select
              value={planCfg.chauffeurId}
              onChange={(e) => {
                const id = +e.target.value;
                const ch = chauffeurs.find((c) => c.id === id);
                setPlanCfg((p) => ({
                  ...p,
                  chauffeurId: id,
                  camionId: ch?.camionId || p.camionId,
                }));
              }}
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
            >
              {chauffeurs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wide">
              Camion
            </label>
            <select
              value={planCfg.camionId}
              onChange={(e) =>
                setPlanCfg((p) => ({ ...p, camionId: +e.target.value }))
              }
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
            >
              {camions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.immat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wide">
              Période
            </label>
            <select
              value={planCfg.periodeId}
              onChange={(e) =>
                setPlanCfg((p) => ({ ...p, periodeId: +e.target.value }))
              }
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
            >
              {PERIODES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wide">
              Date intervention
            </label>
            <input
              type="date"
              value={planCfg.dateIntervention}
              onChange={(e) =>
                setPlanCfg((p) => ({
                  ...p,
                  dateIntervention: e.target.value,
                }))
              }
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:border-amber-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* ACTIONS */}
      <div className="flex justify-between gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setTab("create")}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-semibold transition-all border border-zinc-700"
          >
            <Icon name="plus" size={14} className="inline mr-1" />
            Ajouter
          </button>
          <button
            onClick={() => setTab("import")}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-semibold transition-all border border-zinc-700"
          >
            <Icon name="upload" size={14} className="inline mr-1" />
            Importer
          </button>
        </div>
        <button
          onClick={executeBatch}
          className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 rounded-lg text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20"
        >
          <Icon name="zap" size={14} />
          Tout créer et planifier ({panier.length})
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  RESULTS VIEW
// ═══════════════════════════════════════════════════════
function ResultsView({ results, setTab }) {
  if (!results.length) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4 opacity-30">📊</div>
        <h2 className="text-lg font-bold text-zinc-400 mb-2">
          Aucun résultat
        </h2>
        <p className="text-sm text-zinc-600">
          Lancez un batch depuis le panier.
        </p>
      </div>
    );
  }

  const ok = results.filter((r) => r.success);
  const fail = results.filter((r) => !r.success);
  const planned = results.filter((r) => r.planned);

  return (
    <div className="space-y-4">
      {/* STATS */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-center">
          <div className="text-3xl font-bold text-emerald-400">{ok.length}</div>
          <div className="text-xs text-zinc-500 uppercase tracking-wider mt-1 font-semibold">
            Créés
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-center">
          <div className="text-3xl font-bold text-blue-400">
            {planned.length}
          </div>
          <div className="text-xs text-zinc-500 uppercase tracking-wider mt-1 font-semibold">
            Planifiés
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-center">
          <div
            className={`text-3xl font-bold ${fail.length ? "text-red-400" : "text-zinc-600"}`}
          >
            {fail.length}
          </div>
          <div className="text-xs text-zinc-500 uppercase tracking-wider mt-1 font-semibold">
            Erreurs
          </div>
        </div>
      </div>

      {/* DETAIL */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider mb-3">
          Détails — {results.length} opération(s)
        </h2>
        <div className="space-y-2">
          {results.map((r, i) => {
            const item = r.item;
            const icon = r.success ? (r.planned ? "✅" : "⚠️") : "❌";
            const status = r.success
              ? r.planned
                ? `Bon ${r.bonNum || r.bonId || "—"} · Planifié`
                : `Bon ${r.bonNum || r.bonId || "—"} · ${r.planError || "Non planifié"}`
              : r.error;
            return (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2.5 bg-zinc-800/50 rounded-lg"
              >
                <span className="text-lg">{icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-zinc-200">
                    {item.operationIcon} Benne {item.benne.id}
                    {item.benne.NumBenne
                      ? ` — ${item.benne.NumBenne}`
                      : ""}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    {item.chantier.nom} · {status}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => setTab("create")}
          className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
        >
          <Icon name="refresh" size={14} />
          Nouveau batch
        </button>
      </div>
    </div>
  );
}
