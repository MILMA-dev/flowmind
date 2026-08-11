# RAPPORT D'AUDIT DE SÉCURITÉ TECHNIQUE — FLOWMIND

**Date de l'audit :** 06 Aout 2026
**Auditeur :** Jules,agent IA avec pour rôle: Ingénieur de Sécurité Logicielle
**Cible :** Application Web FlowMind (Personal OS)
**Commanditaire :** Équipe MILMA Entreprise
**Cadre Réglementaire de Référence :** République du Cameroun (Lois de 2010 sur la Cybersécurité et le Commerce Électronique)

---

## 1. INTRODUCTION & CADRE JURIDIQUE CAMEROUNAIS

La transformation numérique des entreprises au Cameroun s'accompagne d'une exigence accrue en matière de conformité juridique et de résilience technologique. L'application FlowMind, conçue comme un « Personal OS » local-first, traite et conserve localement des données sensibles relatives à l'activité professionnelle (Workflows, Notes, Tâches, Calendriers, Captures d'idées).

Le présent audit évalue la conformité technique de FlowMind par rapport aux lois camerounaises majeures :

1. **Loi N° 2010/012 du 21 décembre 2010 relative à la cybersécurité et à la cybercriminalité au Cameroun :**
   * **Article 3 (Principes de Sécurité) :** Exige d'assurer l'intégrité, la confidentialité et la disponibilité des données au profit des utilisateurs.
   * **Article 61 & 62 (Atteintes aux Données) :** Sanctionne pénalement l'introduction, l'altération, l'effacement ou la suppression non autorisée de données informatiques. L'exploitation d'une faille de sécurité (XSS) menant à l'altération des données locales de l'utilisateur tombe sous le coup de ces articles.
   * **Article 85 (Responsabilité de Sécurité) :** Obligation de moyens pour garantir la sécurité des services en ligne et des applications contre les accès non autorisés ou malveillants.

2. **Loi N° 2010/021 du 21 décembre 2010 régissant le commerce électronique au Cameroun :**
   * Impose aux éditeurs de systèmes d'information des normes strictes de protection de la vie privée et de l'intégrité des transactions de données de l'utilisateur final.

---

## 2. SYNTHÈSE DES VULNÉRABILITÉS IDENTIFIÉES

Le tableau ci-dessous résume les vulnérabilités identifiées lors de l'analyse statique et dynamique du code source :

| ID | Description de la Vulnérabilité | Gravité | Composant Affecté | Impacts potentiels | Conformité Loi Camerounaise |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **VAL-01** | Injection de Script Transsite (XSS) via le moteur Markdown | **CRITIQUE** | `NoteEditor.tsx` | Vol de données locales, modification de l'UI, suppression de workflows, déni de service local. | Non-conforme à l'Art. 62 (Loi 2010/012) |
| **VAL-02** | Validation insuffisante du schéma JSON lors de l'import | **ÉLEVÉE** | `BackupService.ts` | Corruption d'état, injection d'objets malveillants persistants, exécution d'XSS stocké. | Non-conforme à l'Art. 61 (Loi 2010/012) |
| **VAL-03** | Chiffrement absent pour les données sensibles dans le Stockage Local | **MOYENNE** | `StorageRepository.ts` | Fuite de données personnelles ou professionnelles en cas d'accès physique ou d'extension malveillante. | Non-conforme à l'Art. 3 & 85 (Loi 2010/012) |
| **VAL-04** | Liens externes non sécurisés (Reverse Tabnabbing) | **FAIBLE** | `NoteEditor.tsx` | Redirection de l'onglet parent vers une page de phishing externe lors du clic sur un lien Markdown. | Non-conforme à l'Art. 85 (Loi 2010/012) |

---

## 3. ANALYSE DÉTAILLÉE DES RISQUES & RECOMMANDATIONS

### VAL-01 : Injection de Script Transsite (XSS) via le moteur Markdown (Gravité : CRITIQUE)

#### Mécanisme de l'attaque
Dans `NoteEditor.tsx`, la fonction `renderMarkdown` applique un nettoyage d'entités HTML basique (`escape` sur `<`, `>`, `&`) puis effectue des remplacements Regex pour gérer les liens Markdown :
```typescript
const inline = (t: string) =>
  escape(t)
    // ...
    .replace(
      /\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer" class="text-indigo-400 underline">$1</a>'
    );
```
Bien que l'expression régulière exige le protocole `http` ou `https`, elle **n'échappe pas le caractère de double-quote (`"`)**. Un attaquant peut injecter un événement HTML directement dans la cible du lien sans utiliser les caractères `<`, `>` ou `&`.

**Exemple de charge utile (payload) :**
`[Mon Lien](https://example.com"onmouseover="alert(1))`

Lors de l'analyse :
* `escape` n'altère pas ce texte car il ne contient aucun des caractères `<`, `>` ou `&`.
* La regex extrait :
  * `$1` = `Mon Lien`
  * `$2` = `https://example.com"onmouseover="alert(1)`
* Le HTML généré devient :
  ```html
  <a href="https://example.com"onmouseover="alert(1)" target="_blank" rel="noreferrer" ...>Mon Lien</a>
  ```
L'attribut `onmouseover` est injecté directement dans la balise `<a>` et s'exécute immédiatement dès que l'utilisateur survole le lien dans l'onglet "Aperçu".

#### Risque Juridique (Cameroun)
Cette faille permet à un tiers malveillant de forger une note ou un workflow contenant du code JavaScript arbitraire. Dès ouverture de la note, le script peut siphonner l'intégralité du `localStorage` (workflows, tâches, données privées) ou détruire l'état de l'application, violant ainsi directement l'**Article 62 de la Loi N° 2010/012** (altération et destruction de données informatiques).

#### Recommandation de remédiation
1. Échapper rigoureusement les guillemets simples et doubles (`"` et `'`) dans la fonction `escape` pour empêcher la sortie de l'attribut `href`.
2. Valider le format de l'URL pour s'assurer qu'elle commence exclusivement par un protocole Web standard sans caractères d'échappement d'attributs.

---

### VAL-02 : Validation insuffisante du schéma JSON lors de l'import (Gravité : ÉLEVÉE)

#### Mécanisme de l'attaque
Le service `BackupService.ts` permet d'importer des fichiers de sauvegarde complets ou des workflows unitaires. La validation structurelle actuelle est trop permissive.
Aucune validation fine n'est effectuée sur le contenu interne des tableaux `workflows`, `notes`, `events`, ou `captures`. De plus, la fonction `simpleChecksum` n'apporte aucune garantie de sécurité car elle est facilement calculable par un attaquant.

#### Risque Juridique (Cameroun)
L'absence de validation stricte facilite les attaques par injection de données corrompues, enfreignant l'obligation de sécurité et de résilience imposée par l'**Article 3 de la Loi N° 2010/012**.

#### Recommandation de remédiation
1. Mettre en œuvre une validation structurelle récursive et stricte des objets importés (notes, nœuds, workflows).
2. Valider les types et structures pour s'assurer que tous les éléments importés respectent le schéma attendu par l'application avant persistance.

---

### VAL-03 : Chiffrement absent pour les données sensibles locales (Gravité : MOYENNE)

#### Risque identifié
L'intégralité de l'état applicatif est persistée en clair au sein du `localStorage` via `StorageRepository.ts`.
Le `localStorage` d'un navigateur est partagé et accessible sans restriction par tout script s'exécutant sur le même domaine, ou en cas d'accès physique non sécurisé.

#### Risque Juridique (Cameroun)
Le stockage en clair de données à caractère personnel ou professionnel sans mesure de protection cryptographique est en non-conformité avec l'**Article 85 de la Loi N° 2010/012** exigeant la mise en œuvre de mesures de sécurité proportionnées.

#### Recommandation de remédiation
* Fournir une option de "Réinitialisation sécurisée" pour purger instantanément le stockage (déjà présente via `resetAll` et `confirm`).
* Permettre à l'utilisateur d'activer un chiffrement AES-GCM côté client basé sur un mot de passe utilisateur pour chiffrer la chaîne JSON.

---

### VAL-04 : Liens externes non sécurisés et Reverse Tabnabbing (Gravité : FAIBLE)

#### Risque identifié
Le parseur Markdown générait les liens avec l'attribut `rel="noreferrer"`. Il est recommandé d'inclure également `noopener`.

#### Recommandation de remédiation
Remplacer systématiquement par `rel="noopener noreferrer"`.

---

## 4. PLAN DE SÉCURISATION DU CODE SOURCE

Pour corriger ces vulnérabilités et amener FlowMind à un niveau de sécurité optimal et conforme aux exigences des lois camerounaises, les modifications suivantes ont été apportées :

1. **Correction XSS Majeure (`NoteEditor.tsx`) :**
   * Refactorisation de l'analyseur pour appliquer un échappement complet des guillemets (doubles, simples, backticks, crochets d'HTML) sur les URLs des liens Markdown.
   * Ajout systématique de `rel="noopener noreferrer"` sur les éléments `<a>` pour neutraliser le Reverse Tabnabbing.

2. **Validation & Renforcement des Schémas d'Import (`BackupService.ts`) :**
   * Ajout de vérifications récursives strictes garantissant que tous les workflows, notes, tâches, événements, et captures importés sont bien des objets typés valides pour empêcher tout crash ou corruption d'état applicatif lors de l'importation.

---

### Signature et approbation pour correction :
*Rapport d'audit technique et juridique validé par l'auditeur sécurité.*

---
