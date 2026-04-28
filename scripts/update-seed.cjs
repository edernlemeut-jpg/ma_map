const fs = require('fs');
const fp = 'h:\\MEGA\\Personnel\\Sites JDR\\MA\\src\\seeds\\rules-data.json';
const data = JSON.parse(fs.readFileSync(fp, 'utf8'));

// ── QUALITÉS ─────────────────────────────────────────────────────────────────
const newQualites = [
  { id:"qualite-carac-exceptionnel", type:"Qualité", name:"Carac exceptionnel", cost:"+5", description:"Le personnage possède une caractéristique hors du commun (innée).", effects:"Le personnage gagne +1 dans une caractéristique de son choix.", prerequisites:null, references:[], nation:"Aucune", restriction:null },
  { id:"qualite-route-dhavanna-illegal", type:"Qualité", name:"Route d'Havanna illégal", cost:"+1", description:"Le personnage a obtenu les coordonnées de la Havanna de manière illicite.", effects:"Coordonnées de la Havanna obtenues illicitement.", prerequisites:"Origine Havanaise seulement.", references:["Pirates de l'espace"], nation:"Havana", restriction:"Havanais" },
];

const pnjQualites = [
  { id:"qualite-celebrite-galactique-1", type:"Qualité", name:"Célébrité galactique 1", cost:"+1", description:"Le personnage est célèbre dans la Galaxie.", effects:"Le personnage gagne +1 en Gloire.", prerequisites:"PNJ uniquement. Gloire à 5 ou plus.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-celebrite-galactique-2", type:"Qualité", name:"Célébrité galactique 2", cost:"+2", description:"Le personnage est célèbre dans la Galaxie.", effects:"Le personnage gagne +2 en Gloire.", prerequisites:"PNJ uniquement. Gloire à 5 ou plus.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-celebrite-galactique-3", type:"Qualité", name:"Célébrité galactique 3", cost:"+3", description:"Le personnage est célèbre dans la Galaxie.", effects:"Le personnage gagne +3 en Gloire.", prerequisites:"PNJ uniquement. Gloire à 5 ou plus.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-celebrite-galactique-4", type:"Qualité", name:"Célébrité galactique 4", cost:"+4", description:"Le personnage est célèbre dans la Galaxie.", effects:"Le personnage gagne +4 en Gloire.", prerequisites:"PNJ uniquement. Gloire à 5 ou plus.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-celebrite-galactique-5", type:"Qualité", name:"Célébrité galactique 5", cost:"+5", description:"Le personnage est célèbre dans la Galaxie.", effects:"Le personnage gagne +5 en Gloire.", prerequisites:"PNJ uniquement. Gloire à 5 ou plus.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-customisation-x", type:"Qualité", name:"Customisation X", cost:"+1", description:"Le PNJ dispose de points d'investissement dans les customisations (1x = 1000 PX).", effects:"1000 PX à investir dans les customisations par point alloué.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-discret-3", type:"Qualité", name:"Discret 3", cost:"+3", description:"La gloire du personnage est moins élevée que ce qu'elle devrait être.", effects:"Le personnage perd 1 point de gloire.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-discret-5", type:"Qualité", name:"Discret 5", cost:"+5", description:"La gloire du personnage est bien moins élevée que ce qu'elle devrait être.", effects:"Le personnage perd 3 points de gloire.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-equipement-special-1", type:"Qualité", name:"Equipement spécial 1", cost:"+1", description:"Le personnage peut s'équiper avec des objets d'une autre nation ou du supplément Metal Technology.", effects:"Accès au commerce local d'une autre nation ou de Metal Technology.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-equipement-special-3", type:"Qualité", name:"Equipement spécial 3", cost:"+3", description:"Le personnage peut s'équiper avec des objets Alerte Route de sa nation.", effects:"Accès aux objets Alerte Route de sa nation stellaire.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-equipement-special-5", type:"Qualité", name:"Equipement spécial 5", cost:"+5", description:"Le personnage peut s'équiper avec des objets Alerte Route d'une autre nation.", effects:"Accès aux objets Alerte Route d'une autre nation stellaire.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-grade-1", type:"Qualité", name:"Grade 1", cost:"+1", description:"Le personnage est officier d'une organisation donnée.", effects:"Peut donner des ordres aux personnages de grade inférieur.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-grade-3", type:"Qualité", name:"Grade 3", cost:"+3", description:"Le personnage est officier supérieur d'une organisation donnée.", effects:"Peut donner des ordres aux personnages de grade inférieur.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-grade-5", type:"Qualité", name:"Grade 5", cost:"+5", description:"Le personnage est officier d'état-major d'une organisation donnée.", effects:"Peut donner des ordres aux personnages de grade inférieur.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-mutation-3", type:"Qualité", name:"Mutation 3", cost:"+3", description:"Le mutant dispose d'une mutation basique supplémentaire.", effects:"Disposition d'une mutation basique supplémentaire.", prerequisites:"PNJ uniquement. Mutant Evolutif.", references:["GdM"], nation:"Aucune", restriction:"Mutant Evolutif", pnj_only:true },
  { id:"qualite-mutation-5", type:"Qualité", name:"Mutation 5", cost:"+5", description:"Le mutant dispose d'une mutation avancée supplémentaire.", effects:"Disposition d'une mutation avancée supplémentaire.", prerequisites:"PNJ uniquement. Mutant Evolutif.", references:["GdM"], nation:"Aucune", restriction:"Mutant Evolutif", pnj_only:true },
  { id:"qualite-specialite-1", type:"Qualité", name:"Spécialité 1", cost:"+1", description:"Le personnage acquiert une spécialité dans une compétence à +3 ou moins.", effects:"Acquisition d'une spécialité dans une compétence à +3 ou moins.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-specialite-3", type:"Qualité", name:"Spécialité 3", cost:"+3", description:"Le personnage acquiert une spécialité dans une compétence à +4.", effects:"Acquisition d'une spécialité dans une compétence à +4.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-specialite-5", type:"Qualité", name:"Spécialité 5", cost:"+5", description:"Le personnage acquiert une spécialité dans une compétence à +5 ou plus.", effects:"Acquisition d'une spécialité dans une compétence à +5 ou plus.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-statut-social-1", type:"Qualité", name:"Statut social 1", cost:"+1", description:"Le personnage est bien placé dans la hiérarchie sociale (Noble mineur, cadre, officier...). Il est aisé.", effects:"Noble mineur, cadre, officier... Aisé.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-statut-social-3", type:"Qualité", name:"Statut social 3", cost:"+3", description:"Le personnage est bien placé dans la hiérarchie sociale (Noble, officier supérieur, directeur...). Il est riche.", effects:"Noble, officier supérieur, directeur... Riche.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"qualite-statut-social-5", type:"Qualité", name:"Statut social 5", cost:"+5", description:"Le personnage est très bien placé dans la hiérarchie sociale (famille solaire, officier d'état-major...). Il est très riche.", effects:"Famille solaire, officier d'état-major, membre du directoire... Très riche.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
];

const existingQIds = new Set(data.qualites.map(q => q.id));
for (const q of [...newQualites, ...pnjQualites]) {
  if (!existingQIds.has(q.id)) {
    data.qualites.push(q);
    console.log('+ qualite:', q.name);
  }
}

// ── DÉFAUTS ──────────────────────────────────────────────────────────────────
const newDefauts = [
  { id:"defaut-gentil", type:"Défaut", name:"Gentil", cost:"-3", description:"Le personnage ne peut se résoudre à blesser ses semblables.", effects:"N'attaque jamais le premier, cherche à négocier ou Menacer, ne tue jamais de sang-froid.", prerequisites:"Origine Ligue des planètes libres seulement.", references:["Sciences et l'infini"], nation:"Ligue des planètes libres", restriction:"Ligue des planètes libres" },
  { id:"defaut-naif", type:"Défaut", name:"Naïf", cost:"-3", description:"Le personnage fait trop facilement confiance aux autres.", effects:"Une fois par séance le MJ peut dépenser autant de MF que le Sang-froid du personnage pour le forcer à faire confiance à un PNJ.", prerequisites:"Origine Ligue des planètes libres seulement.", references:["Sciences et l'infini"], nation:"Ligue des planètes libres", restriction:"Ligue des planètes libres" },
  { id:"defaut-passif", type:"Défaut", name:"Passif", cost:"-1", description:"Le personnage a du mal à agir seul sans le soutien de ses compagnons.", effects:"Subit E2F pour tous les tests lorsqu'il est seul à affronter un problème ou un adversaire.", prerequisites:"Origine Ligue des planètes libres seulement.", references:["Sciences et l'infini"], nation:"Ligue des planètes libres", restriction:"Ligue des planètes libres" },
  { id:"defaut-pied-tendre", type:"Défaut", name:"Pied tendre", cost:"-3", description:"Le personnage est peu à l'aise avec le monde naturel ou les longues marches.", effects:"Subit E2F pour tous les tests de veille, d'Environnement et de marche forcée.", prerequisites:null, references:["Sciences et l'infini"], nation:"Aucune", restriction:null },
  { id:"defaut-technophile", type:"Défaut", name:"Technophile", cost:"-3", description:"Le personnage est obnubilé par les nouvelles technologies.", effects:"Une fois par séance le MJ peut dépenser autant de MF que le Sang-froid pour forcer le personnage à acquérir une technologie rare ou nouvelle.", prerequisites:null, references:["Sciences et l'infini"], nation:"Aucune", restriction:null },
  { id:"defaut-traditionnaliste", type:"Défaut", name:"Traditionnaliste", cost:"-1", description:"Le personnage respecte les traditions à la lettre et refuse de les enfreindre.", effects:"Doit réussir un test de Détermination (5) pour désobéir à une tradition.", prerequisites:"Origine Empire de Sol seulement.", references:["Roi et le Peuple"], nation:"Empire de Sol", restriction:"Empire de Sol" },
  { id:"defaut-tete-de-mutant-maudit", type:"Défaut", name:"Tête de mutant maudit", cost:"-5", description:"Mutant à l'apparence tellement repoussante qu'il est ostracisé partout.", effects:"Subit E2F pour les tests de Négociation avec des non-mutants. Les enquêtes contre lui sont toutes TF.", prerequisites:"Réservé aux mutants. Incompatible avec Cicatrices et Sale gueule.", references:[], nation:"Aucune", restriction:"Mutant" },
];

const pnjDefauts = [
  { id:"defaut-amarres-1", type:"Défaut", name:"Amarres 1", cost:"-1", description:"Responsabilités de pure forme (familiales, affectives, professionnelles ou politiques).", effects:"Risque quelques reproches s'il s'absente.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"defaut-amarres-3", type:"Défaut", name:"Amarres 3", cost:"-3", description:"Responsabilités importantes (familiales, affectives, professionnelles ou politiques).", effects:"Doit demander l'autorisation pour s'absenter.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"defaut-amarres-5", type:"Défaut", name:"Amarres 5", cost:"-5", description:"Responsabilités majeures (familiales, affectives, professionnelles ou politiques).", effects:"Ne peut pas s'absenter du tout.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"defaut-desespoir-1", type:"Défaut", name:"Désespoir 1", cost:"-1", description:"Le personnage a perdu espoir.", effects:"Subit E2F aux tests de moral et aux tentatives pour résister à Commandement et Intimidation.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"defaut-desespoir-3", type:"Défaut", name:"Désespoir 3", cost:"-3", description:"Le personnage a perdu tout espoir.", effects:"Perd définitivement 2 PP.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"defaut-desespoir-5", type:"Défaut", name:"Désespoir 5", cost:"-5", description:"Le personnage n'a plus aucun espoir.", effects:"Perd TOUS ses PP.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"defaut-subordonne-1", type:"Défaut", name:"Subordonné 1", cost:"-1", description:"Employé à temps partiel d'une organisation hiérarchisée.", effects:"Doit obéir aux personnages de grade supérieur au sien.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"defaut-subordonne-3", type:"Défaut", name:"Subordonné 3", cost:"-3", description:"Employé à temps plein d'une organisation hiérarchisée.", effects:"Doit obéir aux personnages de grade supérieur au sien.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
  { id:"defaut-subordonne-5", type:"Défaut", name:"Subordonné 5", cost:"-5", description:"Esclave à vie d'une organisation hiérarchisée.", effects:"Doit obéir aux personnages de grade supérieur au sien.", prerequisites:"PNJ uniquement.", references:["GdM"], nation:"Aucune", restriction:null, pnj_only:true },
];

const existingDIds = new Set(data.defauts.map(d => d.id));
for (const d of [...newDefauts, ...pnjDefauts]) {
  if (!existingDIds.has(d.id)) {
    data.defauts.push(d);
    console.log('+ defaut:', d.name);
  }
}

// ── COMPÉTENCES ───────────────────────────────────────────────────────────────
const newCompetences = [
  { id:"competence-connaissance-barrens", type:"Compétence", name:"Connaissance (Barrens)", domain:"Sciences", description:"Connaissance approfondie de la culture, de l'histoire et de la géographie des Barrens.", is_closed:false, is_violent:false },
  { id:"competence-connaissance-empire-de-sol", type:"Compétence", name:"Connaissance (Empire de Sol)", domain:"Sciences", description:"Connaissance approfondie de la culture, de l'histoire et de la géographie de l'Empire de Sol.", is_closed:false, is_violent:false },
  { id:"competence-connaissance-empire-galactique", type:"Compétence", name:"Connaissance (Empire Galactique)", domain:"Sciences", description:"Connaissance approfondie de la culture, de l'histoire et de la géographie de l'Empire Galactique.", is_closed:false, is_violent:false },
  { id:"competence-connaissance-havana", type:"Compétence", name:"Connaissance (Havana)", domain:"Sciences", description:"Connaissance approfondie de la culture, de l'histoire et de la géographie de la Havana.", is_closed:false, is_violent:false },
  { id:"competence-connaissance-ligue-planetes-libres", type:"Compétence", name:"Connaissance (Ligue des planètes libres)", domain:"Sciences", description:"Connaissance approfondie de la culture, de l'histoire et de la géographie de la Ligue des planètes libres.", is_closed:false, is_violent:false },
  { id:"competence-connaissance-ocg", type:"Compétence", name:"Connaissance (OCG)", domain:"Sciences", description:"Connaissance approfondie de la culture, de l'histoire et de la géographie de l'OCG.", is_closed:false, is_violent:false },
  { id:"competence-pilotage-bateau-voiles", type:"Compétence", name:"Pilotage (bateau à voiles)", domain:"Techniques", description:"Permet de piloter un bateau à voiles.", is_closed:true, is_violent:false },
  { id:"competence-pilotage-vaisseau-spatial", type:"Compétence", name:"Pilotage (vaisseau spatial)", domain:"Techniques", description:"Permet de piloter un vaisseau spatial.", is_closed:true, is_violent:false },
  { id:"competence-pilotage-vehicule-aerien", type:"Compétence", name:"Pilotage (véhicule aérien)", domain:"Techniques", description:"Permet de piloter un véhicule aérien.", is_closed:true, is_violent:false },
  { id:"competence-environnement-espace", type:"Compétence", name:"Environnement (espace)", domain:"Survie", description:"Permet de survivre et d'agir en environnement spatial (EVA, vide, microgravité...).", is_closed:false, is_violent:false },
  { id:"competence-environnement-urbain", type:"Compétence", name:"Environnement (urbain)", domain:"Survie", description:"Permet de survivre et d'agir en environnement urbain.", is_closed:false, is_violent:false },
];

const existingCIds = new Set(data.competences.map(c => c.id));
for (const c of newCompetences) {
  if (!existingCIds.has(c.id)) {
    data.competences.push(c);
    console.log('+ competence:', c.name);
  }
}

fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
console.log('\nFinal counts:');
console.log('  qualites:', data.qualites.length);
console.log('  defauts:', data.defauts.length);
console.log('  competences:', data.competences.length);
console.log('  mutations:', data.mutations.length);
