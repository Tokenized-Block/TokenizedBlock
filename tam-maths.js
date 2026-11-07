// tam-maths.js -- TAM, mathematiques du hasard et des nombres, chaque systeme une simulation honnete comparee a une formule EXACTE.
//
// VUE SEULEMENT : rien ici ne se frappe. API identique a tam-biologie.js : SYSTEMES, ENTIERS, COLONNES, SOURCES, simuler(id, params, { n }),
//   reglagesPhysique(id, params). Sortie de simuler() = { params, D, n, bornee, brut (Float64Array n*D, ligne par ligne),
//   lyapunov (null), uniteLyapunov, points: null, invariants, nuage?, film? }.
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun generateur aleatoire natif (graines : mulberry32).
// DETERMINISME : aucune fonction transcendante native. sin/cos/ln = ceux du moteur.
// REGLE DU PROJET : aucune valeur publiee sans source lue. Ici AUCUNE : le nombre de jours d une annee est un CURSEUR (365 par defaut,
//   rien n est affirme) ; chaque formule comparee est derivee dans le commentaire de sa section ; SOURCES est vide expres.
// Les systemes :
//   marcheAleatoire : marches au hasard sur une grille ; <r^2> = n et Var r^2 = n^2 - n EXACTS.
//   aiguilleBuffon  : aiguilles jetees sur un parquet ; P(croise) = 2 l / (pi d) exact, pi relu (approche).
//   anniversaires   : groupes de k personnes ; P(deux partagent un jour) = 1 - prod (1 - i/D) exact.
//   spiraleUlam     : les nombres premiers sur la spirale d Ulam ; leur nombre compare a li(N) et N / ln N (approches : theoreme
//                     des nombres premiers).
import { sinD, cosD, lnD } from './tam-moteur.js';

/* atan avec + - * / et sqrt (meme methode que tam-theories-3.js) */
function atanD(x) { if (!(x - x === 0)) return x === Infinity ? Math.PI / 2 : x === -Infinity ? -Math.PI / 2 : NaN; if (x < 0) return -atanD(-x); if (x > 1) return Math.PI / 2 - atanD(1 / x);
  let y = x / (1 + Math.sqrt(1 + x * x)); y = y / (1 + Math.sqrt(1 + y * y)); const y2 = y * y; let t = y, s = 0; for (let k = 0; k < 30; k++) { s += t / (2 * k + 1); t *= -y2; } return 4 * s; }
function atan2D(y, x) { if (x > 0) return atanD(y / x); if (x < 0) return atanD(y / x) + (y >= 0 ? Math.PI : -Math.PI); return y > 0 ? Math.PI / 2 : y < 0 ? -Math.PI / 2 : 0; }

const PI = Math.PI;

/* game218 : PREMIERE valeur publiee du module (Phil : « autre discipline ») : effectifs des 26 lettres anglaises, Cornell (echantillon de
 *   40 000 mots), lus par Grok Bot (codex 20). Le banc exige valeur = texte lu, URL https. */
const S = (valeur, unite, url, lu) => Object.freeze({ valeur, unite, url, lu });
export const SOURCES = Object.freeze({
  // https://pi.math.cornell.edu/~mec/2003-2004/cryptography/subs/frequencies.html : « English Letter Frequency (based on a sample of 40,000 words) »
  /* game219 : atmosphere standard US 1976, NASA SP-398 tableau 1 (modele I sous 86 km) et page de C. D. Griffin (WVU), lues par Grok Bot 20 */
  // https://ntrs.nasa.gov/api/citations/19770003812/downloads/19770003812.pdf : T0 = 288.15 K
  T0atm: S(288.15, 'K', 'https://ntrs.nasa.gov/api/citations/19770003812/downloads/19770003812.pdf', '288.15'),
  // meme source : p0 = 101325 Pa (1013.250 mbar)
  p0atm: S(101325, 'Pa', 'https://ntrs.nasa.gov/api/citations/19770003812/downloads/19770003812.pdf', '101325'),
  // meme source : gradient -6.5 K/km de 0 a 11 km geopotentiels, 0 de 11 a 20 km
  gradientAtm: S(-0.0065, 'K/m', 'https://ntrs.nasa.gov/api/citations/19770003812/downloads/19770003812.pdf', '-0.0065'),
  // https://cdgriffin.me/stdatm.php : g0 = 9.80665 m/s^2
  g0atm: S(9.80665, 'm/s^2', 'https://cdgriffin.me/stdatm.php', '9.80665'),
  // https://cdgriffin.me/stdatm.php : M0 = 28.9644 kg/kmol
  M0atm: S(0.0289644, 'kg/mol', 'https://cdgriffin.me/stdatm.php', '0.0289644'),
  // https://cdgriffin.me/stdatm.php : R* = 8314.32 J/(kmol K), valeur HISTORIQUE du modele (pas la CODATA actuelle)
  RstarAtm: S(8.31432, 'J/(mol K)', 'https://cdgriffin.me/stdatm.php', '8.31432'),
  // https://cdgriffin.me/stdatm.php : r0 = 6356766 m (conversion geometrique -> geopotentielle)
  r0atm: S(6356766, 'm', 'https://cdgriffin.me/stdatm.php', '6356766'),
  /* game220 : les 30 premiers mots du fichier count_1w.txt de P. Norvig (Natural Language Corpus Data ; corpus Google Web 1T 5-gram, 2006),
   *   lus par Grok Bot 20 : rang = ordre du fichier, compte = occurrences */
  // https://www.norvig.com/ngrams/count_1w.txt : 30 premieres lignes
  motsWeb: S('the:23135851162 of:13151942776 and:12997637966 to:12136980858 a:9081174698 in:8469404971 for:5933321709 is:4705743816 on:3750423199 that:3400031103 by:3350048871 this:3228469771 with:3183110675 i:3086225277 you:2996181025 it:2813163874 not:2633487141 or:2590739907 be:2398724162 are:2393614870 from:2275595356 at:2272272772 as:2247431740 your:2062066547 all:2022459848 have:1564202750 new:1551258643 more:1544771673 an:1518266684 was:1483428678', 'occurrences', 'https://www.norvig.com/ngrams/count_1w.txt', 'the:23135851162 of:13151942776 and:12997637966 to:12136980858 a:9081174698 in:8469404971 for:5933321709 is:4705743816 on:3750423199 that:3400031103 by:3350048871 this:3228469771 with:3183110675 i:3086225277 you:2996181025 it:2813163874 not:2633487141 or:2590739907 be:2398724162 are:2393614870 from:2275595356 at:2272272772 as:2247431740 your:2062066547 all:2022459848 have:1564202750 new:1551258643 more:1544771673 an:1518266684 was:1483428678'),
  /* game221 : Gutenberg-Richter, lus par Grok Bot 20 */
  // https://pubs.usgs.gov/of/2013/1165/pdf/ofr2013-1165_appendixL.pdf : region UCERF, 1997-2011, M >= 4.0 : b = 1.03 (IC 98 % [0.94 ; 1.11])
  bCalifornie: S(1.03, '', 'https://pubs.usgs.gov/of/2013/1165/pdf/ofr2013-1165_appendixL.pdf', '1.03'),
  // https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&starttime=2024-01-01&endtime=2024-12-31T23:59:59.999&minmagnitude=4.5&eventtype=earthquake&orderby=time-asc :
  //   comptes par classe de 0.5 (borne basse : nombre), 6397 seismes, compte par Grok le 2026-11-06 (catalogue revisable)
  comcat2024: S('4.5:4890 5:1163 5.5:245 6:71 6.5:18 7:9 7.5:1 8:0', 'seismes par classe', 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&starttime=2024-01-01&endtime=2024-12-31T23:59:59.999&minmagnitude=4.5&eventtype=earthquake&orderby=time-asc', '4.5:4890 5:1163 5.5:245 6:71 6.5:18 7:9 7.5:1 8:0'),
  /* game223 : constantes harmoniques M2 et S2 de la station NOAA 8454000 (Providence, RI ; moyenne vectorielle 2015-2019), lues par le
   *   sous-agent Claude du codex 21 puis RELUES dans la reponse JSON de NOAA le 2026-11-06. Vitesses en degres par heure (astronomiques,
   *   les memes partout) ; amplitudes (m) et phases (deg, GMT) propres a cette station. */
  // https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8454000/harcon.json?units=metric : M2 speed 28.984104
  vitesseM2: S(28.984104, 'deg/h', 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8454000/harcon.json?units=metric', '28.984104'),
  // meme reponse : S2 speed 30
  vitesseS2: S(30, 'deg/h', 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8454000/harcon.json?units=metric', '30'),
  // meme reponse : M2 amplitude 0.595 m, phase_GMT 8.6 deg
  amplitudeM2: S(0.595, 'm', 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8454000/harcon.json?units=metric', '0.595'),
  phaseM2: S(8.6, 'deg', 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8454000/harcon.json?units=metric', '8.6'),
  // meme reponse : S2 amplitude 0.127 m, phase_GMT 32.6 deg
  amplitudeS2: S(0.127, 'm', 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8454000/harcon.json?units=metric', '0.127'),
  phaseS2: S(32.6, 'deg', 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8454000/harcon.json?units=metric', '32.6'),
  /* game224 : energie de liaison par nucleon (keV), evaluation AME2020, lue par le sous-agent Claude du codex 21 puis RELUE ligne par ligne
   *   dans le fichier AME2020 le 2026-11-06 (lignes 39, 44, 85, 112, 547, 573, 629, 3224). Format : noyau:A:B/A. */
  // https://www-nds.iaea.org/amdc/ame2020/mass_1.mas20.txt : colonne BINDING ENERGY/A (keV)
  liaisonAME2020: S('H2:2:1112.2831 He4:4:7073.9156 C12:12:7680.1446 O16:16:7976.2072 Fe56:56:8790.3563 Fe58:58:8792.2534 Ni62:62:8794.5555 U238:238:7570.1262', 'keV par nucleon', 'https://www-nds.iaea.org/amdc/ame2020/mass_1.mas20.txt', 'H2:2:1112.2831 He4:4:7073.9156 C12:12:7680.1446 O16:16:7976.2072 Fe56:56:8790.3563 Fe58:58:8792.2534 Ni62:62:8794.5555 U238:238:7570.1262'),
  /* game225 : moyennes ANNUELLES du CO2 a Mauna Loa (ppm), fichier NOAA GML « File Creation: Fri Oct 9 13:08:13 2026 », 1959-2025, lu par le
   *   sous-agent Claude du codex 22 puis TELECHARGE et recopie par programme le 2026-11-06. Format annee:ppm. */
  // https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_mlo.txt
  co2MaunaLoa: S('1959:315.98 1960:316.91 1961:317.64 1962:318.45 1963:318.99 1964:319.62 1965:320.04 1966:321.37 1967:322.18 1968:323.05 1969:324.62 1970:325.68 1971:326.32 1972:327.46 1973:329.68 1974:330.19 1975:331.13 1976:332.03 1977:333.84 1978:335.41 1979:336.84 1980:338.76 1981:340.12 1982:341.48 1983:343.15 1984:344.87 1985:346.35 1986:347.61 1987:349.31 1988:351.69 1989:353.20 1990:354.45 1991:355.70 1992:356.54 1993:357.21 1994:358.96 1995:360.97 1996:362.74 1997:363.88 1998:366.84 1999:368.54 2000:369.71 2001:371.32 2002:373.45 2003:375.98 2004:377.70 2005:379.98 2006:382.09 2007:384.02 2008:385.83 2009:387.64 2010:390.10 2011:391.85 2012:394.06 2013:396.74 2014:398.81 2015:401.01 2016:404.41 2017:406.76 2018:408.72 2019:411.65 2020:414.21 2021:416.41 2022:418.53 2023:421.08 2024:424.61 2025:427.35', 'ppm', 'https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_mlo.txt', '1959:315.98 1960:316.91 1961:317.64 1962:318.45 1963:318.99 1964:319.62 1965:320.04 1966:321.37 1967:322.18 1968:323.05 1969:324.62 1970:325.68 1971:326.32 1972:327.46 1973:329.68 1974:330.19 1975:331.13 1976:332.03 1977:333.84 1978:335.41 1979:336.84 1980:338.76 1981:340.12 1982:341.48 1983:343.15 1984:344.87 1985:346.35 1986:347.61 1987:349.31 1988:351.69 1989:353.20 1990:354.45 1991:355.70 1992:356.54 1993:357.21 1994:358.96 1995:360.97 1996:362.74 1997:363.88 1998:366.84 1999:368.54 2000:369.71 2001:371.32 2002:373.45 2003:375.98 2004:377.70 2005:379.98 2006:382.09 2007:384.02 2008:385.83 2009:387.64 2010:390.10 2011:391.85 2012:394.06 2013:396.74 2014:398.81 2015:401.01 2016:404.41 2017:406.76 2018:408.72 2019:411.65 2020:414.21 2021:416.41 2022:418.53 2023:421.08 2024:424.61 2025:427.35'),
  /* game226 : population mondiale (milliers, au 1er juillet), ONU World Population Prospects 2024, variante Medium, ligne World (LocID 900),
   *   lue par le sous-agent Claude du codex 22 puis RELUE dans le CSV de l ONU telecharge le 2026-11-07. Format annee:milliers. */
  // https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_TotalPopulationBySex.csv.gz : colonne PopTotal, LocID 900, Variant Medium
  populationONU: S('1950:2493092.848 1960:3015470.894 1970:3694683.794 1980:4447606.236 1990:5327803.11 2000:6171702.993 2010:7021732.148 2020:7887001.292', 'milliers', 'https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_TotalPopulationBySex.csv.gz', '1950:2493092.848 1960:3015470.894 1970:3694683.794 1980:4447606.236 1990:5327803.11 2000:6171702.993 2010:7021732.148 2020:7887001.292'),
  /* game230 : effet photoelectrique, lu par Grok Bot (codex 20) : h, e, c EXACTS (NIST, CODATA 2022) et travaux de sortie de quatre faces
   *   metalliques (cours P9826, Western Ontario, diapositive « Selected Values of Electron Work Functions » : Ag(100), Cu(110), Ir(110), Ta(100)). */
  // https://physics.nist.gov/cuu/Constants/Value/h.html : 6.626 070 15 x 10^-34 J s (exact)
  hPlanck: S(6.62607015e-34, 'J s', 'https://physics.nist.gov/cuu/Constants/Value/h.html', '6.62607015e-34'),
  // https://physics.nist.gov/cuu/Constants/Value/e.html : 1.602 176 634 x 10^-19 C (exact)
  eCharge: S(1.602176634e-19, 'C', 'https://physics.nist.gov/cuu/Constants/Value/e.html', '1.602176634e-19'),
  // https://physics.nist.gov/cuu/Constants/Value/c.html : 299 792 458 m/s (exact)
  cLumiere: S(299792458, 'm/s', 'https://physics.nist.gov/cuu/Constants/Value/c.html', '299792458'),
  // https://physics.uwo.ca/~lgonchar/courses/p9826/Lecture7_Workfunctions.pdf : diapositive 5, travaux de sortie (eV) par face cristalline
  travauxSortie: S('Ag:4.64 Cu:4.48 Ir:5.42 Ta:4.15', 'eV', 'https://physics.uwo.ca/~lgonchar/courses/p9826/Lecture7_Workfunctions.pdf', 'Ag:4.64 Cu:4.48 Ir:5.42 Ta:4.15'),
  /* game231 : demi-vies de six isotopes, NPL Report IR 6 (A. Pearce, 2008), section 4.3, lignes relues dans le PDF (pdftotext -raw) ;
   *   jours, incertitude-type k = 1 ; 14C publie 2.082 x 10^6 et 0.011 x 10^6, ecrit ici en clair (idee : codex Grok Bot 20) */
  // https://eprintspublications.npl.co.uk/4053/1/IR6.pdf : section 4.3 Recommended values, nucleide:demi-vie:incertitude (jours)
  demiViesNPL: S('H3:4497:9 Be7:53.22:0.06 C14:2082000:11000 Co60:1925.2:0.3 I131:8.0223:0.0019 Cs137:10976:30', 'days', 'https://eprintspublications.npl.co.uk/4053/1/IR6.pdf', 'H3:4497:9 Be7:53.22:0.06 C14:2082000:11000 Co60:1925.2:0.3 I131:8.0223:0.0019 Cs137:10976:30'),
  // meme source, section 4.1 : 1 year = 365.242198 (days)
  anneeNPL: S(365.242198, 'days', 'https://eprintspublications.npl.co.uk/4053/1/IR6.pdf', '365.242198'),
  /* game232 : John Snow, On the Mode of Communication of Cholera, 2e ed. 1855 (texte Gutenberg 72894), table IX et le paragraphe qui suit
   *   la table X, relus par moi dans le texte ; idee et lecture du scan Wellcome p. 86 : codex 23, sous-agent Claude */
  // https://www.gutenberg.org/cache/epub/72894/pg72894.txt : TABLE IX, compagnie:maisons:deces du cholera:deces pour 10 000 maisons imprimes (sept premieres semaines)
  snowTableIX: S('SouthwarkVauxhall:40046:1263:315 Lambeth:26107:98:37 RestOfLondon:256423:1422:59', 'houses:deaths:per 10,000 printed', 'https://www.gutenberg.org/cache/epub/72894/pg72894.txt', 'SouthwarkVauxhall:40046:1263:315 Lambeth:26107:98:37 RestOfLondon:256423:1422:59'),
  // meme source, apres la table X : « 2,353 deaths in 40,046 houses ... are 537 deaths to each 10,000 houses ; and 302 deaths to 26,107 ... are 115 »
  snowSeptSuivantes: S('SouthwarkVauxhall:40046:2353:537 Lambeth:26107:302:115', 'houses:deaths:per 10,000 printed', 'https://www.gutenberg.org/cache/epub/72894/pg72894.txt', 'SouthwarkVauxhall:40046:2353:537 Lambeth:26107:302:115'),
  /* game233 : raies de Balmer mesurees, NIST ASD 5.12, multiplets entiers 2 -> n (n = 3 a 9), longueurs Ritz dans le vide (show_av=3) et dans
   *   l air (show_av=2), relues par moi en tableau (format=3) ; R_inf et mp/me CODATA 2022 (idee : codex 23, sous-agent Claude) */
  // https://physics.nist.gov/cgi-bin/cuu/Value?ryd : 10 973 731.568 157 m^-1 (incertitude 0.000 012)
  rInfini: S(10973731.568157, 'm^-1', 'https://physics.nist.gov/cgi-bin/cuu/Value?ryd', '10973731.568157'),
  // https://physics.nist.gov/cgi-bin/cuu/Value?mpsme : 1836.152 673 426
  mpSurMe: S(1836.152673426, '', 'https://physics.nist.gov/cgi-bin/cuu/Value?mpsme', '1836.152673426'),
  // NIST ASD, H I, colonnes ritz_wl_vac(nm) et ritz_wl_air(nm), lignes conf_i "2" conf_k "n" : n:vide:air
  balmerNIST: S('3:656.4632:656.2819 4:486.2691:486.1333 5:434.1691:434.0471 6:410.28991:410.17415 7:397.12020:397.00788 8:389.01577:388.90557 9:383.64789:383.53909', 'nm', 'https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=H+I&low_w=380&upp_w=700&unit=1&show_av=3', '3:656.4632:656.2819 4:486.2691:486.1333 5:434.1691:434.0471 6:410.28991:410.17415 7:397.12020:397.00788 8:389.01577:388.90557 9:383.64789:383.53909'),
  lettresAnglais: S('E:21912 T:16587 A:14810 O:14003 I:13318 N:12666 S:11450 R:10977 H:10795 D:7874 L:7253 U:5246 C:4943 M:4761 F:4200 Y:3853 W:3819 G:3693 P:3316 B:2715 V:2019 K:1257 X:315 Q:205 J:188 Z:128', 'effectifs', 'https://pi.math.cornell.edu/~mec/2003-2004/cryptography/subs/frequencies.html', 'E:21912 T:16587 A:14810 O:14003 I:13318 N:12666 S:11450 R:10977 H:10795 D:7874 L:7253 U:5246 C:4943 M:4761 F:4200 Y:3853 W:3819 G:3693 P:3316 B:2715 V:2019 K:1257 X:315 Q:205 J:188 Z:128'),
});

function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* e^u, u >= 0 : u divise par 2 jusqu a <= 1/2, serie a 30 termes, puis carres (+ - * / seulement) */
function expPosD(u) { let m = 0; while (u > 0.5) { u /= 2; m++; } let s = 1, t = 1; for (let j = 1; j <= 30; j++) { t *= u / j; s += t; } for (let i = 0; i < m; i++) s *= s; return s; }
function decouper(n, images) { const d = []; for (let k = 0; k < images; k++) d.push(Math.floor(k * n / images)); return d; }
function filmDe(debuts, n) {
  const tailles = debuts.map((d, k) => (k + 1 < debuts.length ? debuts[k + 1] : n) - d);
  return { images: debuts.length, parImage: tailles.every((t) => t === tailles[0]) ? tailles[0] : null, debuts, tailles };
}

// ---------- 1 : marche au hasard sur une grille ----------
// Chaque pas : un des 4 voisins, au hasard. Pas e_i unitaires independants, E[e_i . e_j] = 0 (i != j). Exact (derive ici) :
//   r^2 = sum_i sum_j e_i . e_j, donc E[r^2] = n (seuls les termes i = j restent).
//   E[r^4] = sum E[(e_i.e_j)(e_k.e_l)] : termes (i = j, k = l) -> n^2 ; (i != j, {k, l} = {i, j}) -> 2 n (n - 1) E[(e_i.e_j)^2] = n (n - 1)
//   (e_i.e_j vaut 1, -1, 0, 0 avec la meme chance : carre moyen 1/2). Donc Var r^2 = 2 n^2 - n - n^2 = n^2 - n, exact.
//   Moyenne sur M marcheurs : sigma = sqrt((n^2 - n)/M). Et E[x] = 0, Var x = n/2 : sigma sqrt(n / (2 M)).
// Dessin : un film, une image par marcheur (les 12 premiers) : son chemin (x, y) pas a pas.
const MARCHE_DESSINES = 12;
function marcheAleatoire(P, n) {
  const M = P.marcheurs, N = P.pas, rng = mulberry32(P.graine), K = Math.min(MARCHE_DESSINES, M, n);
  const debuts = decouper(n, K), film = filmDe(debuts, n), brut = new Float64Array(n * 3);
  let s2 = 0, sx = 0;
  /* banc du 03/11 : les 12 premiers marcheurs ne dependaient pas de M (curseur « walkers » muet) : on dessine le marcheur floor(f M / K) */
  const quiDessine = new Int32Array(M).fill(-1); for (let f = 0; f < K; f++) quiDessine[Math.floor(f * M / K)] = f;
  for (let w = 0; w < M; w++) {
    let x = 0, y = 0;
    const fi = quiDessine[w], dessine = fi >= 0, d0 = dessine ? film.debuts[fi] : 0, c = dessine ? film.tailles[fi] : 0;
    let ligne = 0;
    const ecrire = (st) => { while (ligne < c && Math.round(ligne * N / (c - 1 || 1)) === st) { const o = 3 * (d0 + ligne); brut[o] = x; brut[o + 1] = y; brut[o + 2] = st; ligne++; } };
    if (dessine) ecrire(0);
    for (let st = 1; st <= N; st++) {
      const u = Math.floor(rng() * 4); if (u === 0) x++; else if (u === 1) x--; else if (u === 2) y++; else y--;
      if (dessine) ecrire(st);
    }
    s2 += x * x + y * y; sx += x;
  }
  return { D: 3, brut, film, unite: 'sans objet (hasard, non chaotique)', invariants: {
    carreDistance: { mesure: s2 / M, formule: N, sigma: Math.sqrt((N * N - N) / M), marcheurs: M, pas: N,
      note: 'mean squared distance from the start after n steps against n (exact) ; sigma from the exact variance n^2 - n' },
    centre: { mesure: sx / M, formule: 0, sigma: Math.sqrt(N / (2 * M)), note: 'mean x position against 0 : no preferred direction (exact), sigma sqrt(n / 2M)' } } };
}

// ---------- 2 : l aiguille de Buffon ----------
// Parquet de lattes de largeur d = 1 (droites y = entier), aiguille de longueur l <= 1 jetee au hasard : centre a une hauteur uniforme,
//   angle uniforme. Exact (derive ici) : elle croise une droite si la distance du centre a la droite la plus proche (uniforme sur
//   [0, 1/2]) est <= (l/2) |sin theta| ; P = int_0^pi (l |sin theta| / 2) / (1/2) dtheta / pi = 2 l / pi.
//   N aiguilles independantes : compte binomial, sigma exact. pi relu = 2 l N / croisements (sigma par la methode delta, APPROCHE).
// Dessin : chaque aiguille dessinee = deux lignes (ses deux bouts) ; 3e colonne : 1 si elle croise une droite, 0 sinon.
function aiguilleBuffon(P, n) {
  const N = P.aiguilles, l = P.longueur, rng = mulberry32(P.graine), dessinees = Math.max(1, Math.floor(n / 2)), brut = new Float64Array(n * 3);
  let croise = 0, k = 0;
  for (let i = 0; i < N; i++) {
    const cx = rng() * 10, cy = rng() * 10, th = rng() * PI, dx = 0.5 * l * cosD(th), dy = 0.5 * l * sinD(th);
    const y1 = cy - dy, y2 = cy + dy, c = Math.floor(y1) !== Math.floor(y2) ? 1 : 0;
    croise += c;
    if (k < dessinees && Math.floor(i * dessinees / N) === k) { const o = 6 * k; brut[o] = cx - dx; brut[o + 1] = y1; brut[o + 2] = c; brut[o + 3] = cx + dx; brut[o + 4] = y2; brut[o + 5] = c; k++; }
  }
  if (n % 2) { const o = 3 * (n - 1); brut[o] = brut[o - 3]; brut[o + 1] = brut[o - 2]; brut[o + 2] = brut[o - 1]; }
  const p = 2 * l / PI, ph = croise / N, sP = Math.sqrt(p * (1 - p) / N);
  return { D: 3, brut, nuage: true, unite: 'sans objet (hasard, non chaotique)', invariants: {
    croisements: { mesure: ph, formule: p, sigma: sP, aiguilles: N, note: 'share of needles crossing a line against 2 l / (pi d) (Buffon, exact) ; binomial sigma' },
    piLu: { mesure: croise ? 2 * l / ph : NaN, formule: PI, sigma: PI * sP / p, ...(croise ? {} : { absente: 'no needle crossed a line' }),
      approchee: 'read back as 2 l / share, first-order sigma', note: 'pi read back from the needles against pi' } } };
}

// ---------- 3 : le paradoxe des anniversaires ----------
// Groupes de k personnes, chacune nee un jour uniforme parmi D (curseur, 365 par defaut). Exact (derive ici) :
//   P(tous differents) = prod_{i=0}^{k-1} (1 - i/D), P(au moins un partage) = 1 - ce produit ;
//   nombre moyen de paires nees le meme jour = C(k, 2) / D (chaque paire a la chance 1/D).
//   G groupes independants : part binomiale, sigma exact ; paires : sigma mesure (ecart-type des groupes / sqrt G).
// Dessin : les anniversaires des premiers groupes, en cercle (angle = jour) ; un groupe par rayon ; 3e colonne : numero du groupe.
function anniversaires(P, n) {
  const k = P.personnes, D = P.jours, G = P.groupes, rng = mulberry32(P.graine), brut = new Float64Array(n * 3);
  let partage = 0, sp = 0, sp2 = 0, ligne = 0;
  const vu = new Int32Array(D);
  /* banc du 03/11 : les premiers groupes ne dependaient pas de G (curseur « groups » muet) : on dessine un groupe tous les G / gd */
  const gd = Math.max(1, Math.min(G, Math.ceil(n / k))); let rang = 0;
  for (let g = 0; g < G; g++) {
    vu.fill(0); let paires = 0; const dessine = rang < gd && Math.floor(rang * G / gd) === g;
    for (let i = 0; i < k; i++) { const j = Math.floor(rng() * D); paires += vu[j]; vu[j]++;
      if (dessine && ligne < n) { const a = 2 * PI * j / D, rr = 1 + 0.15 * rang, o = 3 * ligne; brut[o] = rr * cosD(a); brut[o + 1] = rr * sinD(a); brut[o + 2] = g + 1; ligne++; } }
    if (dessine) rang++;
    if (paires) partage++; sp += paires; sp2 += paires * paires;
  }
  while (ligne < n) { const o = 3 * ligne; brut[o] = brut[o - 3]; brut[o + 1] = brut[o - 2]; brut[o + 2] = brut[o - 1]; ligne++; }
  let tousDiff = 1; for (let i = 0; i < k; i++) tousDiff *= 1 - i / D;
  const p = 1 - tousDiff, mp = sp / G, sdp = Math.sqrt(Math.max(0, sp2 / G - mp * mp) * G / (G - 1));
  return { D: 3, brut, nuage: true, unite: 'sans objet (hasard, non chaotique)', invariants: {
    partage: { mesure: partage / G, formule: p, sigma: Math.sqrt(p * (1 - p) / G), groupes: G, personnes: k, jours: D,
      note: 'share of groups where two people share a birthday against 1 - prod (1 - i/D) (exact) ; binomial sigma' },
    paires: { mesure: mp, formule: k * (k - 1) / (2 * D), ...(sdp > 0 ? { sigma: sdp / Math.sqrt(G) } : {}), note: 'mean number of pairs born on the same day against C(k, 2) / D (exact) ; sigma measured' } } };
}

// ---------- 4 : les nombres premiers sur la spirale d Ulam ----------
// Crible d Eratosthene jusqu a N ; chaque entier place sur la spirale carree (1 au centre). On dessine les premiers.
// Compte EXACT pi(N) (crible) compare a deux formules APPROCHEES du theoreme des nombres premiers : N / ln N (sous-estime) et
//   Li(N) = int_2^N dt / ln t (integree en u = ln t, voir plus bas). Ecart relatif mesure, affiche.
// Ecart moyen entre premiers voisins pres de N : mesure, compare a ln N (approche).
function spiraleUlam(P, n) {
  const N = P.jusqua, crible = new Uint8Array(N + 1);
  crible[0] = 1; crible[1] = 1;
  for (let i = 2; i * i <= N; i++) if (!crible[i]) for (let j = i * i; j <= N; j += i) crible[j] = 1;
  const premiers = []; for (let i = 2; i <= N; i++) if (!crible[i]) premiers.push(i);
  /* position de m sur la spirale carree : anneau k = ceil((sqrt m - 1)/2), cote 2k, depart du coin bas-droit */
  const pos = (m) => { if (m === 1) return [0, 0]; const k = Math.ceil((Math.sqrt(m) - 1) / 2), t = 2 * k, mx = (t + 1) * (t + 1);
    let d = mx - m; if (d < t) return [k - d, -k]; d -= t; if (d < t) return [-k, -k + d]; d -= t; if (d < t) return [-k + d, k]; d -= t; return [k, k - d]; };
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const p = premiers[Math.floor(l * premiers.length / n)], [x, y] = pos(p), o = 3 * l; brut[o] = x; brut[o + 1] = y; brut[o + 2] = p; }
  /* Li(N) = int_{ln 2}^{ln N} e^u / u du (t = e^u) : integrande lisse, Simpson sur 20 000 intervalles. Banc du 03/11 : Simpson en t au
   *   pas 2 ratait la forte courbure de 1/ln t pres de 2 (1.8e-5 relatif a N = 40 000) */
  const M = 20000, u0 = lnD(2), u1 = lnD(N), h = (u1 - u0) / M, fu = (u) => expPosD(u) / u; let s = fu(u0) + fu(u1);
  for (let i = 1; i < M; i++) s += (i % 2 ? 4 : 2) * fu(u0 + i * h);
  const Li = s * h / 3, pN = premiers.length;
  const q = Math.max(1, Math.floor(pN / 10)); let ecarts = 0; for (let i = pN - q; i < pN; i++) ecarts += premiers[i] - premiers[i - 1];
  const gap = ecarts / q, lnN = lnD(N);
  return { D: 3, brut, nuage: true, unite: 'sans objet (arithmetique)', invariants: {
    compteLi: { mesure: pN, formule: Li, ecartRelatif: (pN - Li) / Li, jusqua: N,
      approchee: 'the prime number theorem: Li(N) = integral from 2 to N of dt / ln t is the best simple estimate, not an exact count',
      note: 'number of primes up to N (exact, by the sieve) against Li(N)' },
    compteLn: { mesure: pN, formule: N / lnN, ecartRelatif: (pN - N / lnN) / (N / lnN),
      approchee: 'N / ln N, the first form of the prime number theorem: it undercounts', note: 'number of primes up to N against N / ln N' },
    ecartMoyen: { mesure: gap, formule: lnN, approchee: 'the average gap near N grows like ln N', note: 'mean gap between consecutive primes in the last tenth, against ln N' } } };
}

// ---------- 5 : le triangle de Pascal modulo 2 (Sierpinski) ----------
// Lignes 0 a R - 1 construites par ADDITION (chaque nombre = somme des deux au-dessus), gardees modulo 2 : seuls les impairs comptent.
// Exact (derive ici, Lucas / Glaisher) : C(n, k) est impair si et seulement si les 1 de k sont parmi ceux de n en binaire, donc la ligne n
//   contient 2^(nombre de 1 de n) impairs ; et les 2^m premieres lignes en contiennent (1 + 2)^m = 3^m (chaque chiffre binaire de n vaut
//   0 ou 1 : somme des 2^(chiffres) = produit des (1 + 2)). Le dessin est le triangle de Sierpinski, de dimension ln 3 / ln 2 (non mesuree).
// Mesures : pire ecart, sur toutes les lignes, entre le compte d impairs (par addition) et 2^(popcount n) ; total des 2^m premieres
//   lignes (m = plus grande puissance de 2 <= R) contre 3^m.
// Dessin : chaque impair en (k - n/2, -n) ; 3e colonne : n (etiquette). Echantillonne si plus d impairs que de lignes.
function pascalSierpinski(P, n) {
  const R = P.lignes, impairs = []; let ligne = new Uint8Array(1); ligne[0] = 1;
  let pire = 0, cumul = 0, m = 0; while (2 ** (m + 1) <= R) m++;
  let total2m = 0;
  for (let r = 0; r < R; r++) {
    let c = 0; for (let k = 0; k <= r; k++) if (ligne[k]) { c++; impairs.push([k - r / 2, -r, r]); }
    let pc = 0, x = r; while (x) { pc += x & 1; x >>>= 1; }
    pire = Math.max(pire, Math.abs(c - 2 ** pc)); cumul += c; if (r === 2 ** m - 1) total2m = cumul;
    const suiv = new Uint8Array(r + 2); suiv[0] = 1; suiv[r + 1] = 1; for (let k = 1; k <= r; k++) suiv[k] = (ligne[k - 1] + ligne[k]) & 1; ligne = suiv;
  }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const p = impairs[Math.floor(l * impairs.length / n)], o = 3 * l; brut[o] = p[0]; brut[o + 1] = p[1]; brut[o + 2] = p[2]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (arithmetique)', invariants: {
    impairsParLigne: { mesure: pire, formule: 0, lignes: R, note: 'worst gap, over every row, between the number of odd entries (built by addition) and 2^(number of 1s of n in binary) (Glaisher, exact)' },
    impairsTotal: { mesure: total2m, formule: 3 ** m, puissance: m, impairs: cumul, note: 'odd entries in the first 2^m rows against 3^m (exact)' } } };
}

// ---------- 6 : les cinq solides de Platon ----------
// Sommets (phi = (1 + sqrt 5)/2) : tetraedre (1,1,1) et ses 3 voisins a signes pairs ; cube (+-1,+-1,+-1) ; octaedre (+-1,0,0) et
//   permutations ; dodecaedre (+-1,+-1,+-1) et (0, +-1/phi, +-phi) permutes circulairement ; icosaedre (0, +-1, +-phi) permutes.
// Aretes = paires de sommets a la plus petite distance ; FACES retrouvees par la geometrie seule : un triplet de sommets definit un plan,
//   c est une face si tous les autres sommets sont du meme cote (plans dedoublonnes par leur normale). Rien n est tire d une table.
// Exact (Euler, Schlafli) : V - E + F = 2 ; chaque face a p cotes, chaque sommet q aretes : E = V q / 2 = F p / 2 ; angle diedre
//   sin(theta / 2) = cos(pi / q) / sin(pi / p). Mesures : V - E + F compte, angle entre normales de deux faces voisines.
// Dessin : les aretes (points regulierement espaces) en 3-D ; 3e... (D = 3 : x, y, z). La vue tourne.
const NOMS_SOLIDES = ['tetrahedron', 'cube', 'octahedron', 'dodecahedron', 'icosahedron'];
function sommetsSolide(k) {
  const ph = (1 + Math.sqrt(5)) / 2, cyc = (a) => [a, [a[1], a[2], a[0]], [a[2], a[0], a[1]]], S = [];
  const signes = (v) => { const out = [[]]; for (const c of v) { const nv = []; for (const o of out) { nv.push([...o, c]); if (c !== 0) nv.push([...o, -c]); } out.splice(0, out.length, ...nv); } return out; };
  if (k === 0) return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  if (k === 1) return signes([1, 1, 1]);
  if (k === 2) return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  if (k === 3) { S.push(...signes([1, 1, 1])); for (const v of signes([0, 1 / ph, ph])) S.push(...cyc(v)); return S; }
  for (const v of signes([0, 1, ph])) S.push(...cyc(v)); return S;
}
function solidesPlatoniques(P, n) {
  const k = P.solide, V = sommetsSolide(k), nv = V.length, d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  let dmin = Infinity; for (let i = 0; i < nv; i++) for (let j = i + 1; j < nv; j++) dmin = Math.min(dmin, d2(V[i], V[j]));
  const aretes = []; for (let i = 0; i < nv; i++) for (let j = i + 1; j < nv; j++) if (Math.abs(d2(V[i], V[j]) - dmin) < 1e-9 * dmin) aretes.push([i, j]);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const faces = [];
  for (let i = 0; i < nv; i++) for (let j = i + 1; j < nv; j++) for (let m = j + 1; m < nv; m++) {
    let nrm = cross(sub(V[j], V[i]), sub(V[m], V[i])); const L = Math.sqrt(dot(nrm, nrm)); if (L < 1e-9) continue; nrm = nrm.map((c) => c / L);
    const c0 = dot(nrm, V[i]); let pos = 0, neg = 0, sur = 0; for (const p of V) { const s = dot(nrm, p) - c0; if (s > 1e-9) pos++; else if (s < -1e-9) neg++; else sur++; }
    if (pos && neg) continue; if (pos) { nrm = nrm.map((c) => -c); }
    if (!faces.some((f) => dot(f.n, nrm) > 1 - 1e-9)) faces.push({ n: nrm, sommets: sur });
  }
  const p = faces.length ? faces[0].sommets : 0, q = nv ? (2 * aretes.length) / nv : 0;
  /* angle diedre mesure : entre les normales de deux faces partageant une arete (les 2 faces dont la normale est la plus proche) */
  let cmax = -1; for (let a = 0; a < faces.length; a++) for (let b = a + 1; b < faces.length; b++) cmax = Math.max(cmax, dot(faces[a].n, faces[b].n));
  const diedre = PI - atan2D(Math.sqrt(Math.max(0, 1 - cmax * cmax)), cmax), sTh = cosD(PI / q) / sinD(PI / p), diedreTh = 2 * atan2D(sTh, Math.sqrt(Math.max(0, 1 - sTh * sTh)));
  let pireR = 0; const R0 = Math.sqrt(d2(V[0], [0, 0, 0])); for (const v of V) pireR = Math.max(pireR, Math.abs(Math.sqrt(d2(v, [0, 0, 0])) - R0));
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const t = l * aretes.length / n, e = aretes[Math.floor(t)], f = t - Math.floor(t), a = V[e[0]], b = V[e[1]], o = 3 * l; brut[o] = a[0] + f * (b[0] - a[0]); brut[o + 1] = a[1] + f * (b[1] - a[1]); brut[o + 2] = a[2] + f * (b[2] - a[2]); }
  const deg = 180 / PI;
  /* vu a l ecran (03/11) : trace en CHEMIN, la fin d une arete etait reliee au debut de la suivante (cordes parasites) et la scene affichait
   *   « start / end » : un nuage de points denses le long des aretes */
  return { D: 3, brut, nuage: true, unite: 'sans objet (geometrie)', invariants: {
    euler: { mesure: nv - aretes.length + faces.length, formule: 2, sommets: nv, aretes: aretes.length, faces: faces.length, note: NOMS_SOLIDES[k] + ' : vertices - edges + faces, all three COUNTED from the geometry, against Euler\'s 2' },
    schlafli: { mesure: aretes.length, formule: faces.length * p / 2, cotesParFace: p, aretesParSommet: q, note: 'edges against F p / 2 (each face has p sides, each edge borders 2 faces) ; the solid is {p, q} in Schlafli\'s notation' },
    diedre: { mesure: diedre * deg, formule: diedreTh * deg, note: 'angle between two neighbouring faces (degrees) measured from their normals against sin(theta / 2) = cos(pi / q) / sin(pi / p)' },
    surSphere: { debut: R0, fin: R0, derive: pireR, note: 'every vertex is at the same distance from the centre (witness)' } } };
}

// ---------- 7 : le probleme de Monty Hall ----------
// n portes, une voiture au hasard, le joueur en choisit une, l animateur ouvre une porte perdante parmi les AUTRES (au hasard s il en a
//   plusieurs). Exact (derive ici) : garder gagne 1/n ; changer pour une des n - 2 autres portes fermees, au hasard, gagne
//   ((n - 1)/n) x 1/(n - 2) = (n - 1)/(n (n - 2)) (2/3 pour 3 portes). G parties pour chaque strategie, avec les MEMES tirages :
//   parts binomiales, sigma exact.
// Dessin : deux courbes (vue de face) : la part gagnee cumulee au fil des parties, en gardant (0) et en changeant (1).
function montyHall(P, n) {
  const N = P.portes, G = P.parties, rng = mulberry32(P.graine);
  let gGarde = 0, gChange = 0; const cG = new Float64Array(G), cC = new Float64Array(G);
  for (let g = 0; g < G; g++) {
    const voiture = Math.floor(rng() * N), choix = Math.floor(rng() * N);
    const perdantes = []; for (let d = 0; d < N; d++) if (d !== choix && d !== voiture) perdantes.push(d);
    const ouverte = perdantes[Math.floor(rng() * perdantes.length)];
    const autres = []; for (let d = 0; d < N; d++) if (d !== choix && d !== ouverte) autres.push(d);
    const nouveau = autres[Math.floor(rng() * autres.length)];
    if (choix === voiture) gGarde++; if (nouveau === voiture) gChange++;
    cG[g] = gGarde / (g + 1); cC[g] = gChange / (g + 1);
  }
  const pG = 1 / N, pC = (N - 1) / (N * (N - 2)), brut = new Float64Array(n * 3), moitie = Math.floor(n / 2);
  for (let l = 0; l < n; l++) { const c = l < moitie ? 0 : 1, k = c ? l - moitie : l, m = c ? n - moitie : moitie, g = m === 1 ? G - 1 : Math.round(k * (G - 1) / (m - 1)), o = 3 * l; brut[o] = g + 1; brut[o + 1] = c ? cC[g] : cG[g]; brut[o + 2] = c; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (hasard)', invariants: {
    changer: { mesure: gChange / G, formule: pC, sigma: Math.sqrt(pC * (1 - pC) / G), parties: G, portes: N, note: 'share of games won by switching against (n - 1)/(n (n - 2)) : 2/3 with 3 doors ; binomial sigma' },
    garder: { mesure: gGarde / G, formule: pG, sigma: Math.sqrt(pG * (1 - pG) / G), note: 'share of games won by sticking against 1/n' } } };
}

// ---------- 8 : le joint d Apollonius (idee : codex Grok Bot 2026-11-05) ----------
// Un grand cercle (rayon 1, courbure -1 : il CONTIENT les autres), deux cercles de rayons r1 (curseur) et 1 - r1 poses cote a cote sur
//   un diametre ; chaque interstice entre trois cercles tangents recoit le cercle tangent aux trois, puis on recommence dans les trois
//   nouveaux interstices, G generations (curseur).
// Mesure : chaque nouveau cercle est CHERCHE geometriquement : Newton sur (x, y, r) pour que sa distance a chacun des trois centres
//   vaille la somme (ou la difference, avec le grand cercle) des rayons ; aucune formule de courbure n est utilisee pour le construire.
// Exact (Descartes 1643 ; forme complexe : Lagarias, Mallows, Wilks, Amer. Math. Monthly 109 (2002) 338-361) : pour quatre cercles
//   mutuellement tangents, (k1 + k2 + k3 + k4)^2 = 2 (k1^2 + k2^2 + k3^2 + k4^2), donc le cercle de l interstice a
//   k4 = k1 + k2 + k3 + 2 sqrt(k1 k2 + k2 k3 + k3 k1) ; et avec w = k z (z le centre complexe), (sum w)^2 = 2 sum w^2.
//   Nombre de cercles : 2 a la generation 0 (au-dessus et au-dessous du diametre), puis 6 x 3^(g - 1) a la generation g.
// Temoins : avec r1 = 1/2 les courbures sont (-1, 2, 2, 3) et TOUTES les suivantes sont entieres ; la formule sans le facteur 2,
//   k1 + k2 + k3 + sqrt(...), donne autre chose.
// Dessin (vue de face) : des points sur chaque cercle (x, y) et la generation (etiquette).
function tangentInterstice(a, b, c, x0, y0) {
  /* a, b, c : { x, y, k } (k < 0 : le cercle exterieur) ; F_i = |p - c_i| - (r + 1/k_i) ou |p - c_i| - (1/|k_i| - r) */
  const C = [a, b, c]; let x = x0, y = y0, r = 0.2 / Math.max(...C.map((q) => Math.abs(q.k)));
  for (let it = 0; it < 80; it++) {
    const F = [], J = [];
    for (const q of C) { const dx = x - q.x, dy = y - q.y, d = Math.sqrt(dx * dx + dy * dy); if (q.k < 0) { F.push(d + r - 1 / -q.k); J.push([dx / d, dy / d, 1]); } else { F.push(d - r - 1 / q.k); J.push([dx / d, dy / d, -1]); } }
    const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(J), s = [0, 1, 2].map((j) => det(J.map((row, i) => row.map((v, jj) => (jj === j ? -F[i] : v)))) / D);
    x += s[0]; y += s[1]; r += s[2];
    if (Math.abs(s[0]) + Math.abs(s[1]) + Math.abs(s[2]) < 1e-15 * (1 + Math.abs(x) + Math.abs(y))) break;
  }
  return { x, y, k: 1 / r };
}
function apollonius(P, n) {
  const r1 = P.premier, G = P.generations, O = { x: 0, y: 0, k: -1, g: 0 }, A = { x: -1 + r1, y: 0, k: 1 / r1, g: 0 }, B = { x: r1, y: 0, k: 1 / (1 - r1), g: 0 };
  /* game148 (r1 = 0.37 : pour (O, A, B) le radicande vaut exactement 0, l arrondi le rendait negatif -> NaN) : radicande borne a 0 */
  const rad = (p, q, s) => Math.sqrt(Math.max(0, p * q + q * s + s * p)), descartes = (p, q, s) => p + q + s + 2 * rad(p, q, s), contact = (u, v) => { if (v.k < 0) [u, v] = [v, u]; const dx = v.x - u.x, dy = v.y - u.y, d = Math.sqrt(dx * dx + dy * dy), ru = 1 / Math.abs(u.k); return [u.x + dx / d * ru, u.y + dy / d * ru]; };
  const tous = [O, A, B], parGen = new Array(G + 1).fill(0); let pireK = 0, pireZ = 0, pireEntier = 0, manques = 0, distincts = 0;
  const noter = (p, q, s, d) => { const ex = descartes(p.k, q.k, s.k); pireK = Math.max(pireK, Math.abs(d.k - ex) / ex); /* temoin : formule sans le facteur 2 ; seuls comptent les interstices ou elle differe (radicande non nul : pas (O, A, B)) */
    if (rad(p.k, q.k, s.k) > 1e-9 * ex) { distincts++; if (Math.abs(d.k - (p.k + q.k + s.k + rad(p.k, q.k, s.k))) / d.k > 1e-6) manques++; }
    /* Descartes complexe : w = k z ; (sum w)^2 - 2 sum w^2, rapporte a sum |w|^2 */
    let sr = 0, si = 0, qr = 0, qi = 0, n2 = 0; for (const c of [p, q, s, d]) { const wr = c.k * c.x, wi = c.k * c.y; sr += wr; si += wi; qr += wr * wr - wi * wi; qi += 2 * wr * wi; n2 += wr * wr + wi * wi; }
    pireZ = Math.max(pireZ, Math.sqrt((sr * sr - si * si - 2 * qr) ** 2 + (2 * sr * si - 2 * qi) ** 2) / Math.max(n2, 1)); pireEntier = Math.max(pireEntier, Math.abs(d.k - Math.round(d.k))); };
  /* generation 0 : les deux interstices (O, A, B), au-dessus et au-dessous du diametre */
  let file = [];
  for (const sgn of [1, -1]) { const d = tangentInterstice(O, A, B, -1 + 2 * r1, sgn * 0.5); d.g = 0; tous.push(d); parGen[0]++; noter(O, A, B, d); file.push([O, A, d], [A, B, d], [B, O, d]); }
  for (let g = 1; g <= G; g++) { const suite = [];
    for (const [a, b, c] of file) { const pts = [contact(a, b), contact(b, c), contact(c, a)], d = tangentInterstice(a, b, c, (pts[0][0] + pts[1][0] + pts[2][0]) / 3, (pts[0][1] + pts[1][1] + pts[2][1]) / 3);
      d.g = g; tous.push(d); parGen[g]++; noter(a, b, c, d); suite.push([a, b, d], [b, c, d], [c, a, d]); }
    file = suite; }
  /* dessin : n points repartis sur les cercles, au prorata de la racine du rayon (les petits restent visibles) */
  const poids = tous.map((c) => Math.sqrt(1 / Math.abs(c.k))), total = poids.reduce((u, v) => u + v, 0), brut = new Float64Array(n * 3); let o = 0;
  for (let i = 0; i < tous.length && o < n; i++) { const c = tous[i], m = i === tous.length - 1 ? n - o : Math.max(1, Math.min(n - o, Math.round(n * poids[i] / total))), R = 1 / Math.abs(c.k);
    for (let j = 0; j < m && o < n; j++, o++) { const t = 2 * PI * j / m; brut[3 * o] = c.x + R * cosD(t); brut[3 * o + 1] = c.y + R * sinD(t); brut[3 * o + 2] = i < 3 ? -1 : c.g; } }
  for (; o < n; o++) { brut[3 * o] = 1; brut[3 * o + 1] = 0; brut[3 * o + 2] = -1; }
  const attendu = [2]; for (let g = 1; g <= G; g++) attendu.push(6 * 3 ** (g - 1));
  return { D: 3, brut, nuage: true, unite: 'sans objet (grand cercle de rayon 1)', invariants: {
    courbures: { mesure: pireK, formule: 0, cercles: tous.length - 1, note: 'worst relative gap between the curvature of each circle FOUND geometrically (Newton on the tangency distances) and Descartes k4 = k1 + k2 + k3 + 2 sqrt(k1 k2 + k2 k3 + k3 k1)' },
    centresComplexes: { mesure: pireZ, formule: 0, note: 'worst residual of the complex Descartes theorem (sum k z)^2 = 2 sum (k z)^2 on the centres found (Lagarias, Mallows, Wilks 2002)' },
    cerclesParGeneration: { mesure: parGen.join(' '), formule: attendu.join(' '), note: 'circles found at each generation, against 2 then 6 x 3^(g - 1)' },
    entiers: { ecartEntier: pireEntier, sansFacteur2: manques, comparables: distincts, note: 'witnesses: with r1 = 1/2 every curvature is a whole number (largest distance to one) ; the formula without the factor 2 misses that many of the circles where it differs at all (all of them)' } } };
}

// ---------- 9 : le tas de sable abelien (idee : codex Grok Bot 2026-11-05) ----------
// Une grille c x c ; une case qui porte 4 grains ou plus s eboule : elle en donne un a chacun de ses 4 voisins (au bord, les grains qui
//   sortent tombent dans le puits). On recommence tant qu une case a 4 grains : le tas finit STABLE (0 a 3 grains par case).
// Exact (derive ici) : si u_i est le nombre d eboulements de la case i, chaque case a perdu 4 u_i et recu la somme des u de ses voisins,
//   donc depart - fin = Delta u, Delta le Laplacien reduit (4 sur la diagonale, -1 entre voisins) : identite ENTIERE, a 0 pres.
//   Abelien : l ordre des eboulements ne change ni le tas final ni les u (on stabilise deux fois, pile puis file, et on compare).
//   Recurrentes (Dhar, Phys. Rev. Lett. 64 (1990) 1613, reference du codex de Grok) : les tas stables qu on retrouve en ajoutant des grains
//   sans fin ; leur nombre = det Delta (theoreme matrice-arbre). On les COMPTE un par un, tous les 4^4 et 4^9 tas des grilles 2 x 2 et 3 x 3,
//   par le test de Dhar (un tas est recurrent si on peut bruler toutes ses cases : une case brule quand elle a au moins autant de grains
//   que de voisins pas encore brules), et det Delta est calcule a part, en entiers exacts (elimination de Bareiss, BigInt).
//   Identite du groupe des tas recurrents : e = (6 - (6)°)°, ou ° = stabiliser et 6 = six grains partout ; on verifie (e + e)° = e et
//   (e + r)° = r pour un tas recurrent r tire au hasard. Temoin : le tas vide n est pas recurrent (le test de Dhar le refuse).
// Dessin (vue de face) : l identite e sur la grille c x c, case par case (x, y) et son nombre de grains (etiquette 0 a 3).
function voisinsGrille(c) { const N = c * c, V = new Int32Array(4 * N).fill(-1); for (let i = 0; i < N; i++) { const x = i % c, y = (i - x) / c; let k = 0; if (x > 0) V[4 * i + k++] = i - 1; if (x < c - 1) V[4 * i + k++] = i + 1; if (y > 0) V[4 * i + k++] = i - c; if (y < c - 1) V[4 * i + k++] = i + c; } return V; }
/* stabilise h en place, renvoie les eboulements u ; lifo : pile, sinon file (anneau : chaque case au plus une fois en attente) */
function stabiliser(h, V, lifo) { const N = h.length, u = new Int32Array(N), att = new Int32Array(N + 1), dans = new Uint8Array(N); let a = 0, b = 0, m = 0;
  const met = (i) => { if (!dans[i]) { dans[i] = 1; att[b] = i; b = (b + 1) % (N + 1); m++; } };
  for (let i = 0; i < N; i++) if (h[i] >= 4) met(i);
  while (m) { let i; if (lifo) { b = (b + N) % (N + 1); i = att[b]; } else { i = att[a]; a = (a + 1) % (N + 1); } m--; dans[i] = 0;
    const q = h[i] >> 2; if (!q) continue; h[i] -= 4 * q; u[i] += q; for (let k = 4 * i; k < 4 * i + 4; k++) { const j = V[k]; if (j < 0) break; h[j] += q; if (h[j] >= 4) met(j); } }
  return u; }
function brule(h, V, br, nv) { const N = h.length; br.fill(0); for (let i = 0; i < N; i++) { let c = 0; for (let k = 4 * i; k < 4 * i + 4 && V[k] >= 0; k++) c++; nv[i] = c; }
  let n = 0, chg = true; while (chg) { chg = false; for (let i = 0; i < N; i++) if (!br[i] && h[i] >= nv[i]) { br[i] = 1; n++; chg = true; for (let k = 4 * i; k < 4 * i + 4; k++) { const j = V[k]; if (j < 0) break; nv[j]--; } } }
  return n === N; }
function compterRecurrentes(c) { const N = c * c, V = voisinsGrille(c), h = new Int32Array(N), br = new Uint8Array(N), nv = new Int32Array(N); let r = 0;
  for (let m = 0; m < 4 ** N; m++) { let t = m; for (let i = 0; i < N; i++) { h[i] = t & 3; t >>= 2; } if (brule(h, V, br, nv)) r++; } return r; }
function detLaplacien(c) { const N = c * c, V = voisinsGrille(c), M = []; for (let i = 0; i < N; i++) { const l = new Array(N).fill(0n); l[i] = 4n; for (let k = 4 * i; k < 4 * i + 4 && V[k] >= 0; k++) l[V[k]] = -1n; M.push(l); }
  let prec = 1n; for (let k = 0; k < N - 1; k++) { for (let i = k + 1; i < N; i++) for (let j = k + 1; j < N; j++) M[i][j] = (M[i][j] * M[k][k] - M[i][k] * M[k][j]) / prec; prec = M[k][k]; } return M[N - 1][N - 1]; }
function tasDeSable(P, n) {
  /* banc game150 : un curseur « graine » ne changeait PAS le dessin (il ne servait qu aux controles) : retire, hasard fixe par le cote */
  const c = P.cote, N = c * c, V = voisinsGrille(c), rng = mulberry32(c), br = new Uint8Array(N), nv = new Int32Array(N);
  /* identite : e = (6 - (6)°)° */
  const s = new Int32Array(N).fill(6); stabiliser(s, V, true); const e = new Int32Array(N); for (let i = 0; i < N; i++) e[i] = 6 - s[i]; stabiliser(e, V, true);
  const ee = new Int32Array(N); for (let i = 0; i < N; i++) ee[i] = 2 * e[i]; stabiliser(ee, V, true);
  /* r recurrent au hasard : (3 + hasard 0..3)° ; puis (e + r)° */
  const r = new Int32Array(N); for (let i = 0; i < N; i++) r[i] = 3 + Math.floor(rng() * 4); stabiliser(r, V, true);
  const er = new Int32Array(N); for (let i = 0; i < N; i++) er[i] = e[i] + r[i]; stabiliser(er, V, true);
  let dEE = 0, dER = 0; for (let i = 0; i < N; i++) { if (ee[i] !== e[i]) dEE++; if (er[i] !== r[i]) dER++; }
  const eRec = brule(e, V, br, nv), vide = brule(new Int32Array(N), V, br, nv);
  /* abelien : un tas au hasard (0 a 7 grains par case), stabilise par pile puis par file ; depart - fin = Delta u */
  const h0 = new Int32Array(N); for (let i = 0; i < N; i++) h0[i] = Math.floor(rng() * 8);
  const h1 = h0.slice(), h2 = h0.slice(), u1 = stabiliser(h1, V, true), u2 = stabiliser(h2, V, false);
  let dH = 0, dU = 0, residu = 0, ebs = 0; for (let i = 0; i < N; i++) { if (h1[i] !== h2[i]) dH++; if (u1[i] !== u2[i]) dU++; ebs += u1[i]; let lap = 4 * u1[i]; for (let k = 4 * i; k < 4 * i + 4 && V[k] >= 0; k++) lap -= u1[V[k]]; residu = Math.max(residu, Math.abs(h0[i] - h1[i] - lap)); }
  const comptes = [compterRecurrentes(2), compterRecurrentes(3)], dets = [detLaplacien(2), detLaplacien(3)];
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const i = Math.floor(l * N / n), o = 3 * l; brut[o] = i % c; brut[o + 1] = (i - (i % c)) / c; brut[o + 2] = e[i]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (grains)', invariants: {
    recurrentes: { mesure: comptes.join(' '), formule: dets.join(' '), grandes: [4, 5].map((k) => String(detLaplacien(k))).join(' '), note: 'recurrent piles COUNTED one by one by the burning test of Dhar, on the 2 x 2 and 3 x 3 grids (every one of the 4^4 and 4^9 stable piles), against det of the reduced Laplacian in exact integers (Dhar 1990) ; det for 4 x 4 and 5 x 5 also given' },
    identite: { eePlusE: dEE, ePlusR: dER, recurrente: eRec, videRecurrent: vide, note: 'e = (6 - (6)°)° on the drawn grid : cells where (e + e)° differs from e, cells where (e + r)° differs from r for a random recurrent r (both 0) ; e passes the burning test, the empty pile does not (witness)' },
    abelien: { mesure: residu, formule: 0, tasDifferents: dH, eboulementsDifferents: dU, eboulements: ebs, note: 'a random pile toppled twice, as a stack and as a queue : cells where the final piles differ, cells where the topple counts differ (both 0) ; and the largest gap in start - end = Delta u, exact in whole numbers' } } };
}

// ---------- 10 : le verger d Euclide (idee : codex Grok Bot 2026-11-05) ----------
// Un arbre a chaque point entier (a, b), 1 <= a, b <= N ; debout a l origine, on voit l arbre (a, b) si aucun autre n est devant lui sur la
//   meme droite, c est-a-dire si pgcd(a, b) = 1. On COMPTE les arbres visibles un par un (algorithme d Euclide).
// Exact (derive ici) : (1) pour a < b, (a, b) est visible ssi pgcd(a, b) = 1 : phi(b) choix de a ; meme chose pour b < a ; et (1, 1) est le
//   seul visible de la diagonale. Donc V(N) = 2 sum_{k <= N} phi(k) - 1 (phi par un crible, sans pgcd).
//   (2) Mobius : le nombre de paires dont d divise les deux est floor(N/d)^2, donc V(N) = sum_d mu(d) floor(N/d)^2 (mu par un crible).
//   (3) LIMITE, pas egalite : V(N)/N^2 tend vers 6/pi^2. Borne derivee de (2) : floor(N/d)^2 differe de N^2/d^2 de moins de 2N/d,
//   sum_{d <= N} 1/d <= 1 + ln N, et |sum_{d > N} mu(d)/d^2| <= 1/N ; donc |V/N^2 - 6/pi^2| <= (3 + 2 ln N)/N, ecrite et comparee.
// Temoin : sur la diagonale, un seul arbre visible, (1, 1).
// Dessin (vue de face) : les arbres visibles (a, b) et leur rangee max(a, b) (etiquette).
function pgcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }
function vergerEuclide(P, n) {
  const N = P.cote, vis = []; let diag = 0;
  for (let b = 1; b <= N; b++) for (let a = 1; a <= N; a++) if (pgcd(a, b) === 1) { vis.push(a, b); if (a === b) diag++; }
  const V = vis.length / 2;
  /* phi et mu par crible (aucun pgcd) */
  const phi = new Int32Array(N + 1), mu = new Int32Array(N + 1).fill(1), comp = new Uint8Array(N + 1); for (let k = 0; k <= N; k++) phi[k] = k;
  for (let p = 2; p <= N; p++) if (!comp[p]) { for (let m = p; m <= N; m += p) { if (m > p) comp[m] = 1; phi[m] -= phi[m] / p; mu[m] = -mu[m]; } for (let m = p * p; m <= N; m += p * p) mu[m] = 0; }
  let sPhi = 0, sMu = 0; for (let k = 1; k <= N; k++) { sPhi += phi[k]; const q = Math.floor(N / k); sMu += mu[k] * q * q; }
  const part = V / (N * N), limite = 6 / (PI * PI), borne = (3 + 2 * lnD(N)) / N;
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const i = Math.floor(l * V / n), o = 3 * l; brut[o] = vis[2 * i]; brut[o + 1] = vis[2 * i + 1]; brut[o + 2] = Math.max(vis[2 * i], vis[2 * i + 1]); }
  return { D: 3, brut, nuage: true, unite: 'sans objet (arbres)', invariants: {
    visibles: { mesure: V, formule: 2 * sPhi - 1, sommePhi: sPhi, note: 'trees seen from the corner, COUNTED one by one with Euclid\'s algorithm, against 2 (phi(1) + ... + phi(N)) - 1 with phi from a sieve (no gcd)' },
    mobius: { mesure: V, formule: sMu, note: 'the same count against the sum over d of mu(d) floor(N/d)^2 (Mobius, mu from a sieve)' },
    limite: { mesure: part, formule: limite, ecart: Math.abs(part - limite), borne, note: 'share of trees seen, against its LIMIT 6/pi^2 for an endless orchard (not an equality) ; the gap stays under the derived bound (3 + 2 ln N)/N' },
    diagonale: { mesure: diag, formule: 1, note: 'witness: on the diagonal only (1, 1) is seen, every (k, k) hides behind it' } } };
}

// ---------- 11 : les cercles de Ford (idee : codex Grok Bot 2026-11-05 ; Ford, Amer. Math. Monthly 45 (1938) 586, reference du codex) ----------
// Sur chaque fraction p/q irreductible de [0, 1] avec q <= n (la suite de Farey F_n), le cercle pose sur l axe : centre (p/q, 1/(2 q^2)),
//   rayon 1/(2 q^2). F_n est construite par ENUMERATION de tous les p/q (pgcd 1), triee par produits croises (aucune division).
// Exact (derive ici) : deux cercles p/q et r/s : distance^2 - (r1 + r2)^2 = (ps - qr)^2/(q s)^2 + (r1 - r2)^2 - (r1 + r2)^2
//   = ((ps - qr)^2 - 1)/(q s)^2. Donc ils se TOUCHENT si |ps - qr| = 1 et ne se chevauchent JAMAIS (ps - qr entier non nul).
//   Deux voisins de F_n ont |ps - qr| = 1 (propriete de Farey) : ils se touchent tous. Et |F_n| = 1 + phi(1) + ... + phi(n) (phi par crible).
// Mesure : |ps - qr| pour chaque paire de voisins (entiers), et sur TOUTES les paires le plus petit (ps - qr)^2 - 1 (jamais negatif) ;
//   l ecart de tangence en nombres flottants, distance des centres contre somme des rayons.
// Temoin : 1/3 et 2/3 ne sont pas voisins (|ps - qr| = 3) : leurs cercles ne se touchent pas.
// Dessin (vue de face) : des points sur chaque cercle (x, y) et le denominateur q (etiquette).
function cerclesFord(P, n) {
  const N = P.ordre, F = [];
  for (let q = 1; q <= N; q++) for (let p = 0; p <= q; p++) if (pgcd(p, q) === 1) F.push([p, q]);
  F.sort((u, v) => u[0] * v[1] - v[0] * u[1]);
  const phi = new Int32Array(N + 1); for (let k = 0; k <= N; k++) phi[k] = k; for (let p = 2; p <= N; p++) if (phi[p] === p) for (let m = p; m <= N; m += p) phi[m] = phi[m] / p * (p - 1);
  let sPhi = 0; for (let k = 1; k <= N; k++) sPhi += phi[k];
  const R = (q) => 1 / (2 * q * q);
  let voisinsMal = 0, pireTangence = 0;
  for (let i = 0; i + 1 < F.length; i++) { const [p, q] = F[i], [r, s] = F[i + 1]; if (Math.abs(p * s - q * r) !== 1) voisinsMal++;
    const dx = r / s - p / q, dy = R(s) - R(q), d = Math.sqrt(dx * dx + dy * dy); pireTangence = Math.max(pireTangence, Math.abs(d - R(q) - R(s)) / (R(q) + R(s))); }
  let minChev = Infinity; for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) { const x = F[i][0] * F[j][1] - F[i][1] * F[j][0]; minChev = Math.min(minChev, x * x - 1); }
  const t1 = 1 / 3, t2 = 2 / 3, rt = R(3), temoin = Math.abs(t2 - t1) - 2 * rt;
  const poids = F.map(([, q]) => Math.sqrt(R(q))), total = poids.reduce((u, v) => u + v, 0), brut = new Float64Array(n * 3); let o = 0;
  for (let i = 0; i < F.length && o < n; i++) { const [p, q] = F[i], m = i === F.length - 1 ? n - o : Math.max(1, Math.min(n - o, Math.round(n * poids[i] / total))), r = R(q);
    for (let j = 0; j < m && o < n; j++, o++) { const t = 2 * PI * j / m; brut[3 * o] = p / q + r * cosD(t); brut[3 * o + 1] = r + r * sinD(t); brut[3 * o + 2] = q; } }
  for (; o < n; o++) { brut[3 * o] = 1; brut[3 * o + 1] = 0; brut[3 * o + 2] = 1; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (axe de longueur 1)', invariants: {
    farey: { mesure: F.length, formule: 1 + sPhi, note: 'fractions p/q in [0, 1] with q <= n, ENUMERATED, against 1 + phi(1) + ... + phi(n) (phi from a sieve)' },
    voisins: { mesure: voisinsMal, formule: 0, paires: F.length - 1, note: 'neighbours p/q, r/s of the Farey sequence with |ps - qr| other than 1 (none: every two neighbours touch)' },
    tangence: { mesure: pireTangence, formule: 0, note: 'worst relative gap between the distance of two neighbouring centres and the sum of their radii' },
    chevauchement: { mesure: minChev, formule: 0, note: 'smallest (ps - qr)^2 - 1 over ALL pairs of circles : never below 0, so no two circles ever overlap' },
    temoin: { mesure: temoin, note: 'witness: 1/3 and 2/3 are not neighbours (|ps - qr| = 3) : gap between their circles, above 0' } } };
}

// ---------- 12 : l arbre de Steiner des quatre coins (idee : codex Grok Bot 2026-11-05) ----------
// Relier les quatre coins d un rectangle L x 1 (curseur L) par le reseau de routes le plus COURT, en ajoutant deux carrefours libres S et T.
// Mesure : pour chacune des deux formes possibles (pont horizontal : S relie les coins de gauche, T ceux de droite ; pont vertical : S ceux
//   du bas, T ceux du haut), S et T sont CHERCHES : chacun est replace au point de Fermat de ses trois voisins (iteration de Weiszfeld,
//   moyenne ponderee par 1/distance), tour a tour, 2000 fois. On garde la forme la plus courte.
// Exact (derive ici) : au carrefour les trois routes font 120 degres. Pont horizontal : les bras vers (0, 0) et (0, 1) font 60 degres avec
//   l horizontale, S = (1/(2 sqrt 3), 1/2), chaque bras mesure 1/sqrt 3, le pont L - 1/sqrt 3 : total L + sqrt 3 (valable pour
//   L >= 1/sqrt 3). Pont vertical, par symetrie : 1 + sqrt(3) L. Le plus court : min(L + sqrt 3, 1 + sqrt(3) L) ; pour le carre, 1 + sqrt 3.
// Temoins : l arbre couvrant minimal sans carrefour (2 min(L, 1) + max(L, 1)) et la croix des diagonales (2 sqrt(1 + L^2)), plus longs.
// Dessin (vue de face) : le reseau le plus court (etiquette 0) et l autre forme (etiquette 1, plus longue).
function fermatSteiner(P, n) {
  const L = P.largeur, A = [0, 0], B = [L, 0], C = [L, 1], Dd = [0, 1], dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
  const fermat = (Q, a, b, c) => { const wa = 1 / Math.max(dist(Q, a), 1e-300), wb = 1 / Math.max(dist(Q, b), 1e-300), wc = 1 / Math.max(dist(Q, c), 1e-300), w = wa + wb + wc; return [(a[0] * wa + b[0] * wb + c[0] * wc) / w, (a[1] * wa + b[1] * wb + c[1] * wc) / w]; };
  const cosA = (Q, u, v) => ((u[0] - Q[0]) * (v[0] - Q[0]) + (u[1] - Q[1]) * (v[1] - Q[1])) / (dist(Q, u) * dist(Q, v));
  const forme = (vertical) => { const [s1, s2, t1, t2] = vertical ? [A, B, Dd, C] : [A, Dd, B, C]; let S = vertical ? [L / 2, 0.3] : [0.3, 0.5], T = vertical ? [L / 2, 0.7] : [L - 0.3, 0.5];
    for (let k = 0; k < 2000; k++) { S = fermat(S, s1, s2, T); T = fermat(T, t1, t2, S); }
    const segs = [[S, s1], [S, s2], [S, T], [T, t1], [T, t2]], long = segs.reduce((u, [a, b]) => u + dist(a, b), 0);
    const ecart = Math.max(...[[S, s1, s2], [S, s1, T], [S, s2, T], [T, t1, t2], [T, t1, S], [T, t2, S]].map(([Q, u, v]) => Math.abs(cosA(Q, u, v) + 0.5)));
    return { long, S, T, segs, ecart, vertical }; };
  const h = forme(false), v = forme(true), best = h.long <= v.long ? h : v, autre = best === h ? v : h, r3 = Math.sqrt(3);
  const brut = new Float64Array(n * 3), moitie = Math.ceil(n * 0.7);
  const tracer = (f, de, a, lab) => { const tot = f.segs.reduce((u, [p, q]) => u + dist(p, q), 0); for (let l = de; l < a; l++) { let t = (l - de + 0.5) / (a - de) * tot, i = 0; while (i < 4 && t > dist(...f.segs[i])) { t -= dist(...f.segs[i]); i++; } const [p, q] = f.segs[i], u = Math.min(1, t / dist(p, q)), o = 3 * l; brut[o] = p[0] + u * (q[0] - p[0]); brut[o + 1] = p[1] + u * (q[1] - p[1]); brut[o + 2] = lab; } };
  tracer(best, 0, moitie, 0); tracer(autre, moitie, n, 1);
  const ex = Math.min(L + r3, 1 + r3 * L), sEx = best.vertical ? null : [1 / (2 * r3), 0.5];
  return { D: 3, brut, nuage: true, unite: 'sans objet (rectangle L x 1)', invariants: {
    longueur: { mesure: best.long, formule: ex, pont: best.vertical ? 'vertical' : 'horizontal', note: 'length of the shortest network FOUND (two free crossroads moved to the Fermat point of their neighbours, Weiszfeld) against min(L + sqrt 3, 1 + sqrt(3) L) ; 1 + sqrt 3 for the square' },
    angles: { mesure: best.ecart, formule: 0, note: 'largest |cos + 1/2| between two roads at a crossroad : 0 means exactly 120 degrees everywhere' },
    carrefour: { mesure: sEx ? Math.max(Math.abs(best.S[0] - sEx[0]), Math.abs(best.S[1] - sEx[1])) : Math.max(Math.abs(best.S[0] - L / 2), Math.abs(best.S[1] - L / (2 * r3))), formule: 0, note: 'distance of the first crossroad found from (1/(2 sqrt 3), 1/2) (or (L/2, L/(2 sqrt 3)) for the vertical bridge : its arms start from the two bottom towns, L apart)' },
    plusLongs: { autreForme: autre.long, arbreSansCarrefour: 2 * Math.min(L, 1) + Math.max(L, 1), croix: 2 * Math.sqrt(1 + L * L), note: 'witnesses, all longer : the other shape, the shortest network without crossroads, the cross of the diagonals' } } };
}

// ---------- 13 : la caustique de la tasse (idee : codex Grok Bot 2026-11-05) ----------
// Des rayons paralleles (le Soleil) entrent dans une tasse ronde de rayon R = 1 et se reflechissent sur sa paroi. La ligne brillante au fond
//   de la tasse est l ENVELOPPE des rayons reflechis. Mesure : N rayons (curseur), chaque rayon reflechi est coupe par son voisin ; le point
//   de croisement est un point de la caustique (aucune formule de la courbe n est utilisee pour le trouver).
// Exact (derive ici) : le rayon qui touche la paroi en P = (cos t, sin t) repart dans la direction d = (-cos 2t, -sin 2t) (miroir : i - 2 (i.n) n).
//   L enveloppe de la famille P + s d est atteinte pour s = cos(t)/2, soit le point ((3 cos t - cos 3t)/4, (3 sin t - sin 3t)/4) : la
//   NEPHROIDE de parametre R/4 (Huygens ; Lockwood, A Book of Curves, ch. 7 — references du codex de Grok). Sa pointe est a R/2 du centre,
//   et la demi-nephroide dessinee dans la tasse (t de -90 a 90 degres) mesure 3R.
//   Erreurs du croisement de deux voisins (mesurees le 2026-11-05 a N = 200, 2000, 20000) : point a 3.7/N^2 de la courbe, pointe a 0.62/N^2,
//   longueur de la ligne brisee 3R - 9.4/N (toujours plus courte : cordes inscrites, extremites coupees).
// Temoin : un miroir rond n est PAS une parabole : le rayon entre a 60 degres recoupe l axe en x = R/(2 cos t) = R, pas en R/2.
// Dessin (vue de face) : la caustique trouvee (etiquette 0), la paroi de la tasse (1), quelques rayons reflechis (2).
function causticTasse(P, n) {
  const N = P.rayons, R = 1, ray = (t) => ({ P: [R * cosD(t), R * sinD(t)], d: [-cosD(2 * t), -sinD(2 * t)] });
  const croise = (r1, r2) => { const det = r1.d[0] * -r2.d[1] - r1.d[1] * -r2.d[0]; if (Math.abs(det) < 1e-300) return null; const dx = r2.P[0] - r1.P[0], dy = r2.P[1] - r1.P[1], s = (dx * -r2.d[1] - dy * -r2.d[0]) / det; return [r1.P[0] + s * r1.d[0], r1.P[1] + s * r1.d[1]]; };
  const pts = []; let pire = 0, pointe = Infinity, long = 0;
  for (let k = 0; k + 1 < N; k++) { const a = -PI / 2 + PI * (k + 0.5) / N, b = a + PI / N, X = croise(ray(a), ray(b)); if (!X) continue;
    const m = (a + b) / 2, ex = [R * (3 * cosD(m) - cosD(3 * m)) / 4, R * (3 * sinD(m) - sinD(3 * m)) / 4];
    pire = Math.max(pire, Math.sqrt((X[0] - ex[0]) ** 2 + (X[1] - ex[1]) ** 2)); pointe = Math.min(pointe, Math.sqrt((X[0] - R / 2) ** 2 + X[1] ** 2));
    if (pts.length) { const q = pts[pts.length - 1]; long += Math.sqrt((X[0] - q[0]) ** 2 + (X[1] - q[1]) ** 2); } pts.push(X); }
  /* temoin : le rayon entre a 60 degres recoupe l axe y = 0 */
  const r60 = ray(PI / 3), s60 = -r60.P[1] / r60.d[1], x60 = r60.P[0] + s60 * r60.d[0];
  const brut = new Float64Array(n * 3), nC = Math.floor(n * 0.5), nP = Math.floor(n * 0.2), nR = n - nC - nP, RAYONS_DESSINES = Math.max(6, Math.round(N / 25)); /* banc game154 : 12 rayons fixes, le curseur ne changeait presque pas le dessin (les croisements restent sur la meme courbe) */
  for (let l = 0; l < nC; l++) { const X = pts[Math.floor(l * pts.length / nC)], o = 3 * l; brut[o] = X[0]; brut[o + 1] = X[1]; brut[o + 2] = 0; }
  for (let l = 0; l < nP; l++) { const t = 2 * PI * l / nP, o = 3 * (nC + l); brut[o] = R * cosD(t); brut[o + 1] = R * sinD(t); brut[o + 2] = 1; }
  for (let l = 0; l < nR; l++) { const j = Math.floor(l * RAYONS_DESSINES / nR), u = (l - Math.ceil(j * nR / RAYONS_DESSINES)) / Math.max(1, Math.ceil(nR / RAYONS_DESSINES)), t = -PI / 2 + PI * (j + 0.5) / RAYONS_DESSINES, r = ray(t), corde = 2 * R * cosD(t), o = 3 * (nC + nP + l);
    brut[o] = r.P[0] + Math.max(0, Math.min(1, u)) * corde * r.d[0]; brut[o + 1] = r.P[1] + Math.max(0, Math.min(1, u)) * corde * r.d[1]; brut[o + 2] = 2; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (tasse de rayon 1)', invariants: {
    nephroide: { mesure: pire, formule: 0, points: pts.length, note: 'largest distance between the crossing of two neighbouring reflected rays and the nephroid ((3 cos t - cos 3t)/4, (3 sin t - sin 3t)/4) ; shrinks as 1/N^2' },
    pointe: { mesure: pointe, formule: 0, note: 'distance of the closest crossing to the point R/2 on the axis, where the nephroid has its cusp' },
    longueur: { mesure: long, formule: 3 * R, note: 'length of the bright line found (chords between crossings) against 3R for half a nephroid ; always a little shorter' },
    temoin60: { mesure: x60, formule: R, note: 'witness: a round mirror is not a parabola : the ray entering 60 degrees from the axis crosses it at R/(2 cos 60) = R, not at R/2' } } };
}

// ---------- 14 : le papillon de Hofstadter (idee : codex Grok Bot 2026-11-05) ----------
// Un electron sur un reseau carre dans un champ magnetique de flux alpha = p/q par maille (operateur de Harper, lambda = 1) :
//   (H psi)_n = psi_(n+1) + psi_(n-1) + 2 cos(2 pi alpha n + theta) psi_n. Pour chaque p/q (q <= curseur), son spectre en energie E ;
//   l ensemble des spectres, alpha en abscisse, dessine le papillon.
// Derive ici (relation de Chambers) : avec T(E, theta) le produit des q matrices de transfert [[E - V_n, -1], [1, 0]], le polynome
//   P(E) = tr T(E, theta) + 2 cos(q theta) ne depend pas de theta, et det(E - H(theta, k)) = tr T - 2 cos(q k). Le spectre est
//   { E : |P(E)| <= 4 }. Ses 2q BORDS sont donc les valeurs propres de deux matrices reelles symetriques q x q : P = +4 <=> H a theta = 0,
//   periodique (coin +1) ; P = -4 <=> H a theta = pi/q, antiperiodique (coin -1). Valeurs propres par la methode de Jacobi.
// Mesure : pour chaque p/q, |P| <= 4 au milieu de chaque bande et |P| > 4 au milieu de chaque gap ouvert (gap > 1e-9).
// Exact (source lue par Grok Bot, citation : Krasovsky, arXiv:1602.08624, introduction, qui cite van Mouche 1989 et Choi, Elliott, Yui
//   1990) : pour alpha = p/q le spectre est fait de q bandes separees par des gaps tous ouverts, SAUF le gap central quand q est pair
//   (les deux bandes centrales se touchent en E = 0). Donc q - 1 gaps ouverts si q est impair, q - 2 s il est pair.
//   Pour 1/3 (derive : P(E) = E^3 - 6E) les bords sont -1 - sqrt 3, -2, 1 - sqrt 3, sqrt 3 - 1, 2, 1 + sqrt 3 (valeurs de Grok Bot).
// Borne MESUREE : jusqu a q = 20 chaque gap ouvert depasse 1e-9 ; a q = 21 (p = 2) certains gaps, ouverts en theorie, tombent sous la
//   precision des nombres flottants : le curseur s arrete a 20.
// Temoin : « q - 1 bandes » (un enonce faux rencontre) : 2/5 a bien 5 bandes.
// Dessin (vue de face) : chaque bande (alpha, E) et son denominateur q (etiquette).
function jacobiSym(A) { const n = A.length; A = A.map((r) => r.slice());
  for (let s = 0; s < 100; s++) { let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j]; if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) { if (Math.abs(A[p][q]) < 1e-300) continue; const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = (th < 0 ? -1 : 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let k = 0; k < n; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - sn * b; A[k][q] = sn * a + c * b; }
      for (let k = 0; k < n; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - sn * b; A[q][k] = sn * a + c * b; } } }
  return A.map((r, i) => r[i]); }
function harperP(E, p, q) { const th = PI / (2 * q); let a = 1, b = 0, c = 0, d = 1; for (let n = 0; n < q; n++) { const v = E - 2 * cosD(2 * PI * p * n / q + th), na = v * a - c, nb = v * b - d; c = a; d = b; a = na; b = nb; } return a + d; }
function harperMat(p, q, th, coin) { const A = Array.from({ length: q }, () => new Array(q).fill(0)); for (let n = 0; n < q; n++) A[n][n] = 2 * cosD(2 * PI * p * n / q + th);
  if (q === 1) { A[0][0] += 2 * coin; return A; } for (let n = 0; n + 1 < q; n++) { A[n][n + 1] += 1; A[n + 1][n] += 1; } A[0][q - 1] += coin; A[q - 1][0] += coin; return A; }
function harperBords(p, q) { return [...jacobiSym(harperMat(p, q, 0, 1)), ...jacobiSym(harperMat(p, q, PI / q, -1))].sort((u, v) => u - v); }
function papillonHofstadter(P, n) {
  const Q = P.qmax, fr = []; /* (boucle ecrite autrement que celle de Ford, sinon le mutant de Ford trouve son motif deux fois) */ for (let q = 1; q <= Q; q++) for (let p = q; p >= 0; p--) if (pgcd(p, q) === 1) fr.push([p, q]);
  let malBandes = 0, malGaps = 0, centre = 0, sym = 0; const bandes = [];
  for (const [p, q] of fr) { const e = harperBords(p, q); let ouverts = 0;
    for (let b = 0; b < q; b++) { const lo = e[2 * b], hi = e[2 * b + 1]; if (Math.abs(harperP((lo + hi) / 2, p, q)) > 4 + 1e-9) malBandes++; bandes.push([p / q, lo, hi, q]);
      if (b + 1 < q && e[2 * b + 2] - hi > 1e-9) { ouverts++; if (Math.abs(harperP((hi + e[2 * b + 2]) / 2, p, q)) <= 4) malBandes++; } }
    if (ouverts !== (q % 2 ? q - 1 : q - 2)) malGaps++;
    if (q % 2 === 0) centre = Math.max(centre, Math.abs(e[q - 1]), Math.abs(e[q]));
    for (let i = 0; i < 2 * q; i++) sym = Math.max(sym, Math.abs(e[i] + e[2 * q - 1 - i])); }
  const r3 = Math.sqrt(3), ex13 = [-1 - r3, -2, 1 - r3, r3 - 1, 2, 1 + r3], e13 = harperBords(1, 3); let ecart13 = 0; for (let i = 0; i < 6; i++) ecart13 = Math.max(ecart13, Math.abs(e13[i] - ex13[i]));
  const b25 = harperBords(2, 5).length / 2;
  /* dessin : n points sur les bandes, au moins un par bande si possible, le reste au prorata de la largeur */
  const larg = bandes.map((b) => b[2] - b[1]), tot = larg.reduce((u, v) => u + v, 0), brut = new Float64Array(n * 3); let o = 0;
  const base = n >= bandes.length ? 1 : 0, reste = n - base * bandes.length;
  for (let i = 0; i < bandes.length && o < n; i++) { const [x, lo, hi, q] = bandes[i], m = Math.min(n - o, base + Math.floor(reste * larg[i] / tot));
    for (let j = 0; j < m; j++, o++) { brut[3 * o] = x; brut[3 * o + 1] = m === 1 ? (lo + hi) / 2 : lo + (hi - lo) * j / (m - 1); brut[3 * o + 2] = q; } }
  for (; o < n; o++) { const b = bandes[o % bandes.length]; brut[3 * o] = b[0]; brut[3 * o + 1] = (b[1] + b[2]) / 2; brut[3 * o + 2] = b[3]; }
  return { D: 3, brut, nuage: true, unite: 'energie (unites du saut entre sites)', invariants: {
    bandes: { mesure: malBandes, formule: 0, fractions: fr.length, bandes: bandes.length, note: 'bands where |P| > 4 at the middle, or open gaps where |P| <= 4 at the middle : the edges found really bound the spectrum' },
    gaps: { mesure: malGaps, formule: 0, note: 'fractions p/q whose number of open gaps is not q - 1 (q odd) or q - 2 (q even : the central gap closes) — van Mouche ; Choi, Elliott, Yui (cited by Krasovsky 2016)' },
    centreFerme: { mesure: centre, formule: 0, note: 'for even q, distance from E = 0 of the two central edges : the middle bands touch exactly at 0' },
    tiers: { mesure: ecart13, formule: 0, note: 'edges for 1/3 against -1 - sqrt 3, -2, 1 - sqrt 3, sqrt 3 - 1, 2, 1 + sqrt 3 (P(E) = E^3 - 6E)' },
    miroirE: { mesure: sym, formule: 0, note: 'largest |E + E\'| between mirror edges : the spectrum is symmetric under E -> -E' },
    temoin: { mesure: b25, formule: 5, note: 'witness: 2/5 has 5 bands, not 4 (the claim « q - 1 bands » is false ; q - 1 is the number of GAPS for odd q)' } } };
}

// ---------- 15 : les pavages par dominos (idee : codex Grok Bot 2026-11-05 ; Kasteleyn, Physica 27 (1961) 1209, reference du codex) ----------
// Un rectangle de m x L cases (curseurs) couvert de dominos 1 x 2. On COMPTE tous les pavages, colonne par colonne : l etat est l ensemble des
//   cases de la colonne deja couvertes par un domino couche qui depasse de la colonne precedente (2^m etats, entiers exacts BigInt).
// Exact : produit de Kasteleyn (et Temperley-Fisher), m et L pairs : prod_{j <= m/2} prod_{k <= L/2} (4 cos^2(pi j/(m+1)) + 4 cos^2(pi k/(L+1))).
//   Derive ici : m = 2 donne la suite de Fibonacci (une colonne debout, ou deux dominos couches) ; m L impair : 0 pavage (chaque domino
//   couvre 2 cases).
// Tirage UNIFORME d un pavage : les memes comptes, lus a l envers (chaque choix de colonne pris avec la probabilite nombre de fins / total).
//   Mesure : sur 2000 pavages tires, la part ou la case du coin (0, 0) est couverte par un domino couche, contre sa probabilite EXACTE
//   (pavages qui commencent ainsi / total) ; sigma binomial.
// Dessin (vue de face) : UN pavage tire au hasard (curseur graine), chaque domino trace entre ses deux cases (etiquette 0 couche, 1 debout).
function dominoTransitions(m) { const T = Array.from({ length: 1 << m }, () => []);
  for (let e = 0; e < 1 << m; e++) { const rec = (i, s, ch) => { if (i === m) { T[e].push({ sortie: s, choix: ch.slice() }); return; } if (e >> i & 1) return rec(i + 1, s, ch);
      ch.push([0, i]); rec(i + 1, s | 1 << i, ch); ch.pop(); if (i + 1 < m && !(e >> (i + 1) & 1)) { ch.push([1, i]); rec(i + 2, s, ch); ch.pop(); } }; rec(0, 0, []); }
  return T; }
function dominosKasteleyn(P, n) {
  const m = P.hauteur, L = P.largeur, T = dominoTransitions(m), R = [new Array(1 << m).fill(0n)]; R[0][0] = 1n;
  for (let k = 1; k <= L; k++) { const r = new Array(1 << m).fill(0n); for (let e = 0; e < 1 << m; e++) for (const t of T[e]) r[e] += R[k - 1][t.sortie]; R.push(r); }
  const total = R[L][0];
  let kast = null; if (m % 2 === 0 && L % 2 === 0) { kast = 1; for (let j = 1; j <= m / 2; j++) for (let k = 1; k <= L / 2; k++) kast *= 4 * cosD(PI * j / (m + 1)) ** 2 + 4 * cosD(PI * k / (L + 1)) ** 2; }
  /* Fibonacci : le meme comptage sur 2 x L */
  const T2 = dominoTransitions(2); let v = [1n, 0n, 0n, 0n]; for (let c = 0; c < L; c++) { const w = [0n, 0n, 0n, 0n]; for (let e = 0; e < 4; e++) if (v[e]) for (const t of T2[e]) w[t.sortie] += v[e]; v = w; }
  let fa = 1n, fb = 1n; for (let i = 1; i < L; i++) [fa, fb] = [fb, fa + fb];
  const rng = mulberry32(P.graine), entier = (tot) => { let u = 0n; for (let i = 0; i < 4; i++) u = (u << 30n) + BigInt(Math.floor(rng() * 1073741824)); return u % tot; };
  const tirer = () => { let e = 0; const cols = []; for (let c = 0; c < L; c++) { let u = entier(R[L - c][e]); for (const t of T[e]) { const w = R[L - c - 1][t.sortie]; if (u < w) { cols.push(t.choix); e = t.sortie; break; } u -= w; } } return cols; };
  let pCoin = 0, mesCoin = 0; const TIRAGES = 2000;
  if (total > 0n) { let h = 0n; for (const t of T[0]) if (t.choix.some(([k, i]) => k === 0 && i === 0)) h += R[L - 1][t.sortie]; pCoin = Number(h) / Number(total);
    for (let s = 0; s < TIRAGES; s++) if (tirer()[0].some(([k, i]) => k === 0 && i === 0)) mesCoin++; }
  const brut = new Float64Array(n * 3);
  if (total > 0n) { const cols = tirer(), doms = []; cols.forEach((ch, c) => ch.forEach(([k, i]) => doms.push(k === 0 ? [c, i, c + 1, i, 0] : [c, i, c, i + 1, 1])));
    for (let l = 0; l < n; l++) { const d = doms[Math.floor(l * doms.length / n)], f = (l * doms.length / n) % 1, o = 3 * l; brut[o] = d[0] + 0.5 + (d[2] - d[0]) * f; brut[o + 1] = d[1] + 0.5 + (d[3] - d[1]) * f; brut[o + 2] = d[4]; } }
  else for (let l = 0; l < n; l++) { const c = l % (m * L), o = 3 * l; brut[o] = Math.floor(c / m) + 0.5; brut[o + 1] = c % m + 0.5; brut[o + 2] = 2; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (cases)', invariants: {
    pavages: { mesure: String(total), formule: kast === null ? null : String(kast), ecartRelatif: kast === null ? null : Math.abs(Number(total) - kast) / Math.max(1, kast), note: 'tilings COUNTED column by column in exact integers, against Kasteleyn\'s product of 4 cos^2 + 4 cos^2 (m and L even ; null otherwise)' },
    coin: { mesure: total > 0n ? mesCoin / TIRAGES : null, formule: total > 0n ? pCoin : null, sigma: total > 0n ? Math.sqrt(pCoin * (1 - pCoin) / TIRAGES) : null, tirages: TIRAGES, note: 'share of 2000 uniform tilings where the corner cell is covered by a lying domino, against its exact probability' },
    fibonacci: { mesure: String(v[0]), formule: String(fb), note: 'witness: the same counting on 2 x L gives the Fibonacci number F(L + 1)' },
    impair: { mesure: m * L % 2 === 1 ? String(total) : null, formule: m * L % 2 === 1 ? '0' : null, note: 'an odd number of cells cannot be tiled : 0 (null when the area is even)' } } };
}

// ---------- 16 : le modele d Ising (idee et valeurs : codex Grok Bot 2026-11-05) ----------
// Des aimants elementaires (spins +1 / -1) sur une grille refermee sur elle-meme (tore) ; chaque paire de voisins prefere etre alignee.
//   Poids d un etat : e^(beta E), E = somme sur les paires voisines de s_i s_j = -H, H l energie (beta = curseur, l inverse de la
//   temperature). Correction de Grok Bot (lot 5) : E ici est la somme des liens, l energie physique est H = -E.
// Exact : sur le tore 4 x 4, les 2^16 = 65 536 etats sont ENUMERES : la fonction de partition Z, l energie moyenne <E> et l aimantation
//   absolue moyenne <|m|> sont des sommes finies, calculees exactement (exp par +, -, *, / seulement).
// Mesure : une simulation de Metropolis sur le meme tore 4 x 4 (un spin tire au hasard bascule si l energie monte, sinon avec la
//   probabilite e^(beta dE)), 20 lots de 1 500 balayages : <E> et <|m|> estimes, barre d erreur par les moyennes de lots.
// LIMITE (pas comparee) : sur une grille infinie la transition a lieu a beta_c = ln(1 + sqrt 2)/2 (Onsager, Phys. Rev. 65 (1944) 117,
//   reference du codex) ; un tore 4 x 4 n a pas de vraie transition, la valeur est donnee pour reperer le curseur.
// Dessin (vue de face) : un instantane de Metropolis sur une grande grille 48 x 48 au meme beta, chaque case avec son spin (etiquette).
function expD(u) { return u >= 0 ? expPosD(u) : 1 / expPosD(-u); }
function isingMetropolis(L, beta, s, rng, balayages) { const N = L * L, acc = []; for (let k = 0; k <= 8; k++) acc.push(expD(-beta * 2 * k));
  for (let t = 0; t < balayages; t++) for (let q = 0; q < N; q++) { const i = Math.floor(rng() * N), x = i % L, y = (i - x) / L;
    const h = s[y * L + (x + 1) % L] + s[y * L + (x - 1 + L) % L] + s[((y + 1) % L) * L + x] + s[((y - 1 + L) % L) * L + x], d = s[i] * h; /* basculer change E de -2 d */
    if (d <= 0 || rng() < acc[d]) s[i] = -s[i]; } }
function isingMesures(L, s) { let E = 0, M = 0; for (let i = 0; i < L * L; i++) { const x = i % L, y = (i - x) / L; E += s[i] * (s[y * L + (x + 1) % L] + s[((y + 1) % L) * L + x]); M += s[i]; } return { E, m: Math.abs(M) / (L * L) }; }
function isingExact(L, beta) { const N = L * L; let Z = 0, ZE = 0, ZM = 0;
  for (let c = 0; c < 1 << N; c++) { let E = 0, M = 0; for (let i = 0; i < N; i++) { const s = (c >> i & 1) ? 1 : -1, x = i % L, y = (i - x) / L;
      E += s * (((c >> (y * L + (x + 1) % L)) & 1) ? 1 : -1) + s * (((c >> (((y + 1) % L) * L + x)) & 1) ? 1 : -1); M += s; }
    const w = expD(beta * E); Z += w; ZE += E * w; ZM += Math.abs(M) / N * w; }
  return { Z, E: ZE / Z, m: ZM / Z }; }
function ising(P, n) {
  const beta = P.beta, rng = mulberry32(P.graine), ex = isingExact(4, beta);
  const s4 = new Int8Array(16).fill(1); isingMetropolis(4, beta, s4, rng, 500);
  const bE = [], bM = []; for (let b = 0; b < 20; b++) { let sE = 0, sM = 0; for (let t = 0; t < 1500; t++) { isingMetropolis(4, beta, s4, rng, 1); const v = isingMesures(4, s4); sE += v.E; sM += v.m; } bE.push(sE / 1500); bM.push(sM / 1500); }
  const st = (v) => { const m = v.reduce((a, b) => a + b, 0) / v.length; return { m, sigma: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1) / v.length) }; };
  const e = st(bE), a = st(bM);
  const G = 48, sg = new Int8Array(G * G); for (let i = 0; i < G * G; i++) sg[i] = rng() < 0.5 ? 1 : -1; isingMetropolis(G, beta, sg, rng, 300);
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const i = Math.floor(l * G * G / n), o = 3 * l; brut[o] = i % G; brut[o + 1] = (i - i % G) / G; brut[o + 2] = sg[i]; }
  const betaC = lnD(1 + Math.sqrt(2)) / 2;
  return { D: 3, brut, nuage: true, unite: 'sans objet (spins)', invariants: {
    energie: { mesure: e.m, formule: ex.E, sigma: e.sigma, note: 'mean bond sum s_i s_j on the 4 x 4 torus (minus the energy H = -sum s_i s_j), Metropolis (20 batches) against the exact sum over all 65 536 states' },
    aimantationAbs: { mesure: a.m, formule: ex.m, sigma: a.sigma, note: 'mean absolute magnetisation per spin, Metropolis against the exact enumeration' },
    partition: { mesure: ex.Z, betaCritique: betaC, note: 'exact partition function Z of the 4 x 4 torus at this beta ; beta_c = ln(1 + sqrt 2)/2 is the LIMIT of an endless grid (Onsager), shown, not compared' } } };
}

// ---------- 17 : le diamant azteque et son cercle arctique (idee, algorithme et valeurs : codex Grok Bot 2026-11-05) ----------
// Le diamant azteque d ordre n : les cases (x, y) avec |x + 1/2| + |y + 1/2| <= n, pavees par des dominos. Un pavage tire UNIFORMEMENT par
//   le « domino shuffling » (Elkies, Kuperberg, Larsen, Propp 1992 ; enonce lu par Grok dans Jockusch, Propp, Shor, arXiv:math/9801068) :
//   d un ordre au suivant, chaque domino a une fleche (N, S, E, O) donnee par la couleur de sa case ; les paires qui se font face sont
//   detruites, les autres glissent d une case, et les trous 2 x 2 recoivent deux dominos couches ou deux debout, a pile ou face.
// Exact : AD(k) = 2^(k(k+1)/2) pavages (EKLP) ; ici COMPTES par retour arriere pour k = 1..4 (2, 8, 64, 1024). Pour l ordre 4, la
//   probabilite exacte qu une case du centre soit couverte par un domino couche est comptee sur les 1024 pavages (1/2, valeur de Grok).
// Mesure : uniformite du tirage (8000 tirages de l ordre 2, khi-deux a 7 degres de liberte) ; frequence de la case du centre a l ordre 4
//   sur 4000 tirages ; part des dominos « geles » (fleche vers le coin de leur region) hors du cercle de rayon n/sqrt 2 et dedans.
// LIMITE (Jockusch, Propp, Shor, theoreme 1, lu par Grok) : quand n grandit, la frontiere du desordre tend vers le cercle inscrit de
//   rayon n/sqrt 2 ; mesuree ici en taille finie, pas une egalite.
// Dessin (vue de face) : un pavage de l ordre n (curseur), chaque domino trace selon sa fleche (etiquette 0 N, 1 S, 2 E, 3 O).
const AZ_DANS = (x, y, k) => Math.abs(x + 0.5) + Math.abs(y + 0.5) <= k;
const azFleche = (d, k) => { const c = (d.x + d.y + k + 1) & 1; return d.h ? (c ? 0 : 1) : (c ? 2 : 3); };
function azShuffle(n, rng) {
  let doms = [];
  for (let k = 1; k <= n; k++) {
    const fl = doms.map((d) => azFleche(d, k - 1)), cle = new Map(); doms.forEach((d, i) => cle.set(d.x + ',' + d.y + ',' + d.h, i));
    const mort = new Uint8Array(doms.length);
    doms.forEach((d, i) => { if (mort[i]) return;
      if (fl[i] === 0) { const j = cle.get(d.x + ',' + (d.y + 1) + ',1'); if (j !== undefined && fl[j] === 1) mort[i] = mort[j] = 1; }
      if (fl[i] === 2) { const j = cle.get((d.x + 1) + ',' + d.y + ',0'); if (j !== undefined && fl[j] === 3) mort[i] = mort[j] = 1; } });
    const nouv = []; doms.forEach((d, i) => { if (mort[i]) return; const v = fl[i]; nouv.push({ x: d.x + (v === 2) - (v === 3), y: d.y + (v === 0) - (v === 1), h: d.h }); });
    const occ = new Set(); for (const d of nouv) { occ.add(d.x + ',' + d.y); occ.add(d.h ? (d.x + 1) + ',' + d.y : d.x + ',' + (d.y + 1)); }
    for (let y = -k; y < k; y++) for (let x = -k; x < k; x++) { if (!AZ_DANS(x, y, k) || occ.has(x + ',' + y)) continue;
      if (rng() < 0.5) nouv.push({ x, y, h: 1 }, { x, y: y + 1, h: 1 }); else nouv.push({ x, y, h: 0 }, { x: x + 1, y, h: 0 });
      for (const [a, b] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) occ.add(a + ',' + b); }
    doms = nouv;
  }
  return doms;
}
function azDefauts(doms, n) { const occ = new Set(); let mal = 0; for (const d of doms) for (const [a, b] of [[d.x, d.y], d.h ? [d.x + 1, d.y] : [d.x, d.y + 1]]) { const k = a + ',' + b; if (!AZ_DANS(a, b, n) || occ.has(k)) mal++; occ.add(k); } return mal + Math.abs(occ.size - 2 * n * (n + 1)); }
function azEnumerer(k, surCentre) { const cases = []; for (let y = -k; y < k; y++) for (let x = -k; x < k; x++) if (AZ_DANS(x, y, k)) cases.push([x, y]);
  const pris = new Set(); let tot = 0, couche = 0, centreCouche = false;
  const rec = (i) => { while (i < cases.length && pris.has(cases[i][0] + ',' + cases[i][1])) i++; if (i === cases.length) { tot++; if (centreCouche) couche++; return; }
    const [x, y] = cases[i], c0 = x + ',' + y;
    for (const [a, b, h] of [[x + 1, y, 1], [x, y + 1, 0]]) { const c1 = a + ',' + b; if (!AZ_DANS(a, b, k) || pris.has(c1)) continue;
      const garde = centreCouche; if (surCentre && h === 1 && ((x === 0 && y === 0) || (a === 0 && b === 0))) centreCouche = true;
      pris.add(c0); pris.add(c1); rec(i + 1); pris.delete(c0); pris.delete(c1); centreCouche = garde; } };
  rec(0); return { tot, couche }; }
function aztecDiamond(P, n) {
  const N = P.ordre, rng = mulberry32(P.graine), doms = azShuffle(N, rng), defauts = azDefauts(doms, N);
  const exC = azEnumerer(4, true), pC = exC.couche / exC.tot, petits = [...[1, 2, 3].map((k) => azEnumerer(k, false).tot), exC.tot], /* ordre 4 enumere UNE fois (MESURE : 362 ms -> voir banc) */ formules = [1, 2, 3, 4].map((k) => 2 ** (k * (k + 1) / 2));
  const freq = new Map(), T = 4000; /* MESURE : 8000 + 4000 tirages = 240 ms ; moitie */ for (let t = 0; t < T; t++) { const k = azShuffle(2, rng).map((q) => q.x + ',' + q.y + ',' + q.h).sort().join(';'); freq.set(k, (freq.get(k) || 0) + 1); }
  const att = T / 8; let khi2 = (8 - freq.size) * att; for (const v of freq.values()) khi2 += (v - att) ** 2 / att;
  let mesC = 0; const TC = 2000;
  for (let t = 0; t < TC; t++) if (azShuffle(4, rng).some((q) => q.h === 1 && q.y === 0 && (q.x === 0 || q.x === -1))) mesC++;
  const R = N / Math.SQRT2; let out = 0, outG = 0, ins = 0, insG = 0;
  for (const q of doms) { const cx = q.x + (q.h ? 1 : 0.5), cy = q.y + (q.h ? 0.5 : 1), r = Math.sqrt(cx * cx + cy * cy), f = azFleche(q, N), pole = Math.abs(cy) > Math.abs(cx) ? (cy > 0 ? 0 : 1) : (cx > 0 ? 2 : 3);
    if (r > 1.1 * R) { out++; if (f === pole) outG++; } else if (r < 0.9 * R) { ins++; if (f === pole) insG++; } }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const q = doms[Math.floor(l * doms.length / n)], u = (l * doms.length / n) % 1, o = 3 * l;
    brut[o] = q.x + 0.5 + (q.h ? u : 0); brut[o + 1] = q.y + 0.5 + (q.h ? 0 : u); brut[o + 2] = azFleche(q, N); }
  return { D: 3, brut, nuage: true, unite: 'sans objet (cases)', invariants: {
    pavageValide: { mesure: defauts, formule: 0, dominos: doms.length, note: 'cells covered zero or twice, or outside the diamond, in the tiling drawn (n (n + 1) dominoes expected)' },
    petitsDiamants: { mesure: petits.join(' '), formule: formules.join(' '), note: 'tilings of the diamonds of order 1 to 4 COUNTED by backtracking, against 2^(k (k + 1)/2) (Elkies, Kuperberg, Larsen, Propp)' },
    uniformite: { mesure: khi2, formule: 7, sigma: Math.sqrt(14), tirages: T, note: 'chi-square of 4000 shuffled tilings of order 2 over its 8 tilings (7 degrees of freedom : mean 7, spread sqrt 14)' },
    caseCentre: { mesure: mesC / TC, formule: pC, sigma: Math.sqrt(pC * (1 - pC) / TC), note: 'order 4 : share of shuffled tilings where the centre cell is covered by a lying domino, against its exact probability counted over the 1024 tilings' },
    arctique: { mesure: out ? outG / out : null, dedans: ins ? insG / ins : null, rayon: R, note: 'share of FROZEN dominoes (arrow towards their own corner) outside 1.1 n/sqrt 2, and inside 0.9 n/sqrt 2 ; the arctic circle n/sqrt 2 is a LIMIT for large n' } } };
}

// ---------- 18 : le collectionneur de vignettes (idee et valeurs : codex Grok Bot ; Feller, vol. I, 3e ed., ch. IX §3 ex. (d), p. 224-225) ----------
// n vignettes equiprobables (curseur) ; on tire avec remise jusqu a les avoir toutes. T = nombre de tirages.
// Exact (derive ici) : quand j vignettes sont deja la, la suivante arrive apres un temps geometrique de parametre (n - j)/n ;
//   T est la somme de ces n temps : E[T] = n (1 + 1/2 + ... + 1/n) = n H_n ; Var[T] = n^2 (1 + 1/4 + ... + 1/n^2) - n H_n.
//   Calcules en FRACTIONS exactes (BigInt). Et apres t tirages, le nombre moyen de vignettes distinctes est n (1 - (1 - 1/n)^t)
//   (chaque vignette manque avec la probabilite (1 - 1/n)^t).
// Mesure : 3000 collections simulees : moyenne et variance de T ; nombre moyen de distinctes a chaque tirage, contre la courbe exacte.
// Dessin : les courbes « distinctes apres t tirages » de quelques collections (etiquette = la collection) et la courbe exacte (etiquette 0).
function fracAdd(a, b) { const p = a[0] * b[1] + b[0] * a[1], q = a[1] * b[1]; let x = p < 0n ? -p : p, y = q; while (y) [x, y] = [y, x % y]; return [p / x, q / x]; }
function collectionneur(P, n) {
  const N = P.vignettes, K = 3000, DESSINEES = 6, rng = mulberry32(P.graine);
  let H = [0n, 1n], H2 = [0n, 1n]; for (let k = 1n; k <= BigInt(N); k++) { H = fracAdd(H, [1n, k]); H2 = fracAdd(H2, [1n, k * k]); }
  const Nb = BigInt(N), E = fracAdd([Nb * H[0], H[1]], [0n, 1n]), V = fracAdd([Nb * Nb * H2[0], H2[1]], [-E[0], E[1]]);
  const Ef = Number(E[0]) / Number(E[1]), Vf = Number(V[0]) / Number(V[1]);
  const tMax = Math.ceil(3 * Ef), somme = new Float64Array(tMax + 1), courbes = [];
  let s = 0, s2 = 0;
  for (let r = 0; r < K; r++) { const vu = new Uint8Array(N); let d = 0, t = 0; const c = r < DESSINEES ? [0] : null;
    while (d < N || t < tMax) { t++; const v = Math.floor(rng() * N); if (!vu[v]) { vu[v] = 1; d++; if (d === N) { s += t; s2 += t * t; } } if (t <= tMax) somme[t] += d; if (c && t <= tMax) c.push(d); if (d === N && t >= tMax) break; }
    if (c) courbes.push(c); }
  const moy = s / K, varia = (s2 - K * moy * moy) / (K - 1);
  let pireCourbe = 0; for (let t = 1; t <= tMax; t++) { const ex = N * (1 - (1 - 1 / N) ** t); pireCourbe = Math.max(pireCourbe, Math.abs(somme[t] / K - ex)); }
  /* banc game160 (n = 2 points : part = 0, division par zero, NaN) : au plus n - 1 collections dessinees, part >= 1 */
  const Dn = Math.min(DESSINEES, Math.max(0, n - 1)), brut = new Float64Array(n * 3), part = Math.max(1, Math.floor(n / (Dn + 1)));
  for (let l = 0; l < n; l++) { const g = Math.min(Dn, Math.floor(l / part)), j = l - g * part, m = g === Dn ? n - Dn * part : part, t = Math.round(1 + j * (tMax - 1) / Math.max(1, m - 1)), o = 3 * l;
    brut[o] = t; brut[o + 1] = g < Dn ? courbes[g][t] : N * (1 - (1 - 1 / N) ** t); brut[o + 2] = g < Dn ? g + 1 : 0; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (tirages)', invariants: {
    tirageMoyen: { mesure: moy, formule: Ef, sigma: Math.sqrt(Vf / K), exacte: E[0] + '/' + E[1], note: 'mean number of draws to complete the set, over 3000 simulated collections, against n H_n (exact fraction given)' },
    variance: { mesure: varia, formule: Vf, exacte: V[0] + '/' + V[1], note: 'variance of the number of draws against n^2 (1 + 1/4 + ... + 1/n^2) - n H_n (exact fraction given)' },
    courbeDistinctes: { mesure: pireCourbe, sigmaMax: Math.sqrt(N / 4 / K) * 1, note: 'largest gap between the mean number of distinct coupons after t draws and n (1 - (1 - 1/n)^t)' } } };
}

// ---------- 19 : la ruine du joueur (idee et valeurs : codex Grok Bot ; Feller, vol. I, 3e ed., ch. XIV §2, p. 344-345, lu par Grok) ----------
// Un joueur part de z euros, gagne 1 avec la probabilite p, perd 1 sinon, et s arrete a 0 (ruine) ou a a (objectif). Curseurs p, z, a.
// Exact (Feller (2.4), (2.5)) : avec r = q/p, la probabilite de ruine est q_z = (r^a - r^z)/(r^a - 1) si p != 1/2, et 1 - z/a si p = 1/2.
//   Duree moyenne du jeu : z (a - z) si p = 1/2 ; sinon z/(q - p) - (a/(q - p)) (1 - r^z)/(1 - r^a).
//   Derive ici : q_z verifie q_z = p q_(z+1) + q q_(z-1), q_0 = 1, q_a = 0 ; la duree D_z = 1 + p D_(z+1) + q D_(z-1), D_0 = D_a = 0.
// Mesure : 20 000 parties simulees : part des ruines, duree moyenne (barre d erreur par l ecart-type des durees).
// Temoin : a p = 1/2 la ruine est exactement lineaire en z (1 - z/a) ; un petit avantage (p = 0.55) l ecrase.
// Dessin : la fortune de 12 parties au fil des coups (etiquette = la partie), et les deux murs 0 et a (etiquette 0).
function ruineJoueur(P, n) {
  const p = P.gain, a = P.objectif, z = Math.min(P.depart, a - 1), q = 1 - p, rng = mulberry32(P.graine), T = 20000, DESSINEES = 12;
  const r = q / p, egal = Math.abs(p - 0.5) < 1e-12;
  const qz = egal ? 1 - z / a : (r ** a - r ** z) / (r ** a - 1), dz = egal ? z * (a - z) : z / (q - p) - (a / (q - p)) * (1 - r ** z) / (1 - r ** a);
  let ruines = 0, sd = 0, sd2 = 0; const traces = [];
  for (let k = 0; k < T; k++) { let x = z, d = 0; const tr = k < DESSINEES ? [x] : null; while (x > 0 && x < a) { x += rng() < p ? 1 : -1; d++; if (tr && tr.length < 4000) tr.push(x); } if (x === 0) ruines++; sd += d; sd2 += d * d; if (tr) traces.push(tr); }
  const md = sd / T, vd = (sd2 - T * md * md) / (T - 1);
  /* banc game161 (n = 2 ou 7 points : parTrace = 0, trace inexistante) : parTrace >= 1 */
  const brut = new Float64Array(n * 3), murs = Math.floor(n * 0.1), parTrace = Math.max(1, Math.floor((n - murs) / DESSINEES)), longMax = Math.max(...traces.map((t) => t.length));
  for (let l = 0; l < n; l++) { const o = 3 * l;
    if (l < murs) { const u = l / Math.max(1, murs - 1); brut[o] = u * (longMax - 1); brut[o + 1] = l % 2 ? a : 0; brut[o + 2] = 0; continue; }
    const g = Math.min(DESSINEES - 1, Math.floor((l - murs) / parTrace)), j = (l - murs) - g * parTrace, tr = traces[g], t = Math.min(tr.length - 1, Math.round(j * (tr.length - 1) / Math.max(1, parTrace - 1)));
    brut[o] = t; brut[o + 1] = tr[t]; brut[o + 2] = g + 1; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (euros, coups)', invariants: {
    ruine: { mesure: ruines / T, formule: qz, sigma: Math.sqrt(qz * (1 - qz) / T), depart: z, note: 'share of 20 000 games ending at 0, against (r^a - r^z)/(r^a - 1), r = q/p (1 - z/a when p = 1/2) — Feller XIV (2.4), (2.5)' },
    duree: { mesure: md, formule: dz, sigma: Math.sqrt(vd / T), note: 'mean length of a game against z (a - z) at p = 1/2, or z/(q - p) - (a/(q - p)) (1 - r^z)/(1 - r^a)' } } };
}

// ---------- 20 : les nombres de Catalan et les chemins de Dyck (idee et valeurs : codex Grok Bot ; Feller vol. I, ch. III §1 (a), p. 69, lu par Grok) ----------
// Un chemin de Dyck : n montees et n descentes qui ne passent jamais sous le sol (une chaine de montagnes). C_n = nombre de tels chemins.
// Exact : C_n = binom(2n, n)/(n + 1) (reflexion d Andre ; lien avec le theoreme du scrutin, Feller III §1). Les chemins sont COMPTES un
//   par un (retour arriere) pour n = 0..12 et compares au binome en entiers exacts (BigInt).
// Tirage UNIFORME (lemme cyclique, derive ici) : melanger n montees et n + 1 descentes ; parmi les 2n + 1 rotations, une seule commence
//   juste apres le PREMIER point le plus bas : elle donne un chemin de Dyck suivi d une descente, et chaque chemin de Dyck provient d exactement
//   2n + 1 melanges equiprobables -> uniforme.
// Mesure : 7000 tirages de demi-longueur 4, khi-deux sur les 14 chemins (13 degres de liberte) ; chaque chemin dessine reste au-dessus du sol.
// Temoin : sans la contrainte du sol, binom(2n, n) chemins (252 pour n = 5, pas 42).
// Dessin : 4 chemins de Dyck tires au hasard de demi-longueur n (curseur), pas (x) et hauteur (y), etiquette = le chemin.
function dyckTirage(n, rng) { const s = []; for (let i = 0; i < n; i++) s.push(1); for (let i = 0; i <= n; i++) s.push(-1);
  for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = s[i]; s[i] = s[j]; s[j] = t; }
  let h = 0, min = 0, im = -1; for (let i = 0; i < s.length; i++) { h += s[i]; if (h < min) { min = h; im = i; } }
  return [...s.slice(im + 1), ...s.slice(0, im + 1)].slice(0, 2 * n); }
function dyckCompte(n) { let c = 0; const rec = (u, d) => { if (u === n && d === n) { c++; return; } if (u < n) rec(u + 1, d); if (d < u) rec(u, d + 1); }; rec(0, 0); return c; }
function binomB(n, k) { let r = 1n; for (let i = 1n; i <= BigInt(k); i++) r = r * (BigInt(n) - BigInt(k) + i) / i; return r; }
function catalanDyck(P, n) {
  const N = P.demi, rng = mulberry32(P.graine), comptes = [], formules = [];
  for (let k = 0; k <= 12; k++) { comptes.push(dyckCompte(k)); formules.push(String(binomB(2 * k, k) / BigInt(k + 1))); }
  const f = new Map(), T = 7000; let sousSol = 0;
  for (let t = 0; t < T; t++) { const p = dyckTirage(4, rng); let h = 0; for (const x of p) { h += x; if (h < 0) sousSol++; } if (h !== 0) sousSol++; const k = p.join(''); f.set(k, (f.get(k) || 0) + 1); }
  const att = T / 14; let khi2 = (14 - f.size) * att; for (const v of f.values()) khi2 += (v - att) ** 2 / att;
  const CH = 4, chemins = []; for (let c = 0; c < CH; c++) chemins.push(dyckTirage(N, rng));
  /* banc game162 (n = 2 points : par = 0, NaN) : par >= 1 */
  const brut = new Float64Array(n * 3), par = Math.max(1, Math.floor(n / CH));
  for (let l = 0; l < n; l++) { const c = Math.min(CH - 1, Math.floor(l / par)), j = l - c * par, m = c === CH - 1 ? n - c * par : par, i = Math.round(j * 2 * N / Math.max(1, m - 1));
    let h = 0; for (let k = 0; k < i; k++) h += chemins[c][k]; const o = 3 * l; brut[o] = i; brut[o + 1] = h; brut[o + 2] = c; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (pas)', invariants: {
    catalans: { mesure: comptes.join(' '), formule: formules.join(' '), note: 'Dyck paths COUNTED one by one for n = 0..12, against binom(2n, n)/(n + 1) in exact integers' },
    uniformite: { mesure: khi2, formule: 13, sigma: Math.sqrt(26), tirages: T, sousSol, note: 'chi-square of 7000 cyclic-lemma draws of half-length 4 over its 14 paths (13 degrees of freedom) ; draws that dip below the ground : 0 expected' },
    temoin: { mesure: String(binomB(10, 5)), formule: '252', note: 'witness: without the ground rule, binom(10, 5) = 252 paths of length 10, not C_5 = 42' } } };
}

// ---------- 21 : les partitions d entiers et le theoreme pentagonal d Euler (idee et valeurs : codex Grok Bot ; Ahlgren et Ono, Notices AMS 48 (2001) 978, lu par Grok) ----------
// p(n) = nombre de facons d ecrire n comme somme d entiers positifs sans tenir compte de l ordre (5 = 4+1 = 3+2 = 3+1+1 = ...).
// Exact (Euler) : p(n) = p(n-1) + p(n-2) - p(n-5) - p(n-7) + p(n-12) + p(n-15) - ... (nombres pentagonaux generalises k(3k -+ 1)/2).
// Mesure INDEPENDANTE : le meme p(n) par programmation dynamique « par pieces » (ajouter les parts de taille 1, puis 2, ...), entiers exacts.
// Tirage UNIFORME d une partition (derive ici) : T(n, k) = partitions de n en parts <= k ; la plus grande part j est choisie avec la
//   probabilite T(n - j, j)/T(n, k), puis on recommence sur n - j avec des parts <= j. Teste : khi-deux sur les 22 partitions de 8.
// Dessin (vue de face) : le diagramme de Young d une partition tiree au hasard de n (curseur) : une case par unite (etiquette = la ligne).
function partPentagonal(N) { const p = [1n]; for (let n = 1; n <= N; n++) { let s = 0n; for (let k = 1; ; k++) { const g1 = k * (3 * k - 1) / 2, g2 = k * (3 * k + 1) / 2; if (g1 > n) break; const sg = k % 2 ? 1n : -1n; s += sg * p[n - g1]; if (g2 <= n) s += sg * p[n - g2]; } p.push(s); } return p; }
function partPieces(N) { const p = new Array(N + 1).fill(0n); p[0] = 1n; for (let k = 1; k <= N; k++) for (let m = k; m <= N; m++) p[m] += p[m - k]; return p; }
function partTable(N) { const T = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0n)); for (let k = 0; k <= N; k++) T[0][k] = 1n; for (let m = 1; m <= N; m++) for (let k = 1; k <= N; k++) T[m][k] = T[m][k - 1] + (k <= m ? T[m - k][k] : 0n); return T; }
function partTirage(N, T, rng) { const parts = []; let m = N, k = N; while (m > 0) { let u = 0n; for (let i = 0; i < 3; i++) u = (u << 30n) + BigInt(Math.floor(rng() * 1073741824)); u %= T[m][k];
    for (let j = Math.min(k, m); j >= 1; j--) { const w = T[m - j][j]; if (u < w) { parts.push(j); m -= j; k = j; break; } u -= w; } } return parts; }
function partitionEuler(P, n) {
  const N = P.entier, rng = mulberry32(P.graine), A = partPentagonal(200), B = partPieces(200);
  let ecarts = 0; for (let m = 0; m <= 200; m++) if (A[m] !== B[m]) ecarts++;
  const T8 = partTable(8), f = new Map(), S = 11000; for (let s = 0; s < S; s++) { const key = partTirage(8, T8, rng).join('+'); f.set(key, (f.get(key) || 0) + 1); }
  const att = S / 22; let khi2 = (22 - f.size) * att; for (const v of f.values()) khi2 += (v - att) ** 2 / att;
  const parts = partTirage(N, partTable(N), rng), cases = []; parts.forEach((len, r) => { for (let c = 0; c < len; c++) cases.push([c, -r, r]); });
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const q = cases[Math.floor(l * cases.length / n)], o = 3 * l; brut[o] = q[0]; brut[o + 1] = q[1]; brut[o + 2] = q[2]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (cases)', invariants: {
    pentagonal: { mesure: ecarts, formule: 0, p100: String(A[100]), p200: String(A[200]), note: 'values of n in 0..200 where Euler\'s pentagonal recurrence and the independent coin-by-coin count disagree (exact integers)' },
    uniformite: { mesure: khi2, formule: 21, sigma: Math.sqrt(42), tirages: S, note: 'chi-square of 11 000 uniform draws over the 22 partitions of 8 (21 degrees of freedom)' },
    dessinee: { mesure: parts.reduce((x, y) => x + y, 0), formule: N, parts: parts.length, note: 'the Young diagram drawn : its parts add up to n and never increase' } } };
}

// ---------- 22 : la courbe du dragon (pliage de papier) (idee et valeurs : codex Grok Bot ; Riddle, « Heighway Dragon », citant Davis et Knuth 1970, lu par Grok) ----------
// Plier une bande de papier en deux n fois (curseur), puis la deplier a angle droit : la suite des virages trace le dragon de Heighway.
// Exact : H_(n+1) = H_n R (complement inverse de H_n) ; derive ici : le k-ieme virage (k = 2^m (2j + 1)) est R si j est pair, L sinon
//   (le pli du milieu de chaque morceau) — deux constructions INDEPENDANTES comparees virage par virage.
// Mesures exactes sur le trace : 2^n segments unitaires, aucun segment parcouru deux fois (la courbe ne se recouvre jamais), et la distance
//   entre les deux bouts au carre vaut 2^n (chaque pliage multiplie la corde par sqrt 2, derive : rotation de 45 degres et similitude).
// Dessin (vue de face) : le dragon de n plis, des points le long des segments, etiquette = la generation du segment (le pli qui l a cree).
function dragonRecurrence(n) { let h = ''; for (let i = 0; i < n; i++) { let c = ''; for (let k = h.length - 1; k >= 0; k--) c += h[k] === 'R' ? 'L' : 'R'; h = h + 'R' + c; } return h; }
function dragonBits(n) { let h = ''; for (let k = 1; k < 2 ** n; k++) { let x = k; while (x % 2 === 0) x /= 2; h += ((x - 1) / 2) % 2 === 0 ? 'R' : 'L'; } return h; }
function courbeDragon(P, n) {
  const N = P.plis, hR = dragonRecurrence(N), hB = dragonBits(N);
  let differents = 0; for (let k = 0; k < hR.length; k++) if (hR[k] !== hB[k]) differents++;
  let x = 0, y = 0, dx = 1, dy = 0; const aretes = new Set(), pts = [[0, 0]]; let doublons = 0;
  const pas = () => { const key = Math.min(x, x + dx) + ',' + Math.min(y, y + dy) + ',' + (dx !== 0 ? 'h' : 'v'); if (aretes.has(key)) doublons++; aretes.add(key); x += dx; y += dy; pts.push([x, y]); };
  pas(); for (const c of hR) { const ndx = c === 'R' ? dy : -dy, ndy = c === 'R' ? -dx : dx; dx = ndx; dy = ndy; pas(); }
  const segs = pts.length - 1, gen = (s) => { if (s === 0) return 0; let k = s, m = 0; while (k % 2 === 0) { k /= 2; m++; } return N - m; };
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const t = l * segs / n, s = Math.floor(t), u = t - s, a = pts[s], b = pts[s + 1], o = 3 * l; brut[o] = a[0] + u * (b[0] - a[0]); brut[o + 1] = a[1] + u * (b[1] - a[1]); brut[o + 2] = gen(s); }
  return { D: 3, brut, nuage: true, unite: 'sans objet (segments unitaires)', invariants: {
    virages: { mesure: differents, formule: 0, virages: hR.length, debut: hR.slice(0, 15), note: 'turns where the recurrence H R (reverse complement of H) and the bit rule (k = 2^m (2j + 1) : R when j is even) disagree' },
    segments: { mesure: segs, formule: 2 ** N, recouvrements: doublons, note: 'unit segments drawn against 2^n ; segments travelled twice (none : the dragon never overlaps itself)' },
    bouts: { mesure: x * x + y * y, formule: 2 ** N, note: 'squared distance between the two ends against 2^n : each fold multiplies the chord by sqrt 2' } } };
}

// ---------- 23 : le theoreme de Pick (idee : codex Grok Bot ; Pick 1899) ----------
// Un polygone SIMPLE dont les sommets sont des points entiers : aire A = I + B/2 - 1, I = points entiers dedans, B = points entiers sur le bord.
// Ici les trois nombres viennent de trois chemins differents : A par la formule du lacet (somme de produits croises, exacte en entiers),
//   I et B COMPTES point par point (test exact en entiers, sans division), et B recompte une 2e fois par la somme des pgcd des cotes.
// Polygone : k sommets tires au hasard (graine) dans k secteurs d angle, arrondis aux entiers ; on retire tant qu il n est pas simple
//   (cotes qui se touchent, sommet double, demi-tour) — mesure : 1 512 polygones (k 3..30, rayon 8..40), pire cas 3 tirages ; repli triangle.
// Temoin : le noeud papillon (0,0) (4,4) (4,0) (0,4) n est pas simple : le lacet donne 0, 2I + B - 2 donne 17 — Pick ne vaut que pour un polygone simple.
// Dessin (vue de face) : le contour, puis les points entiers, etiquette 0 = contour, 1 = dedans, 2 = sur le bord.
const pickOrient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
const pickSurSeg = (p, q, r) => pickOrient(p, q, r) === 0 && Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
function pickSimple(Q) { const k = Q.length, touche = (a, b, c, d) => (pickOrient(a, b, c) * pickOrient(a, b, d) < 0 && pickOrient(c, d, a) * pickOrient(c, d, b) < 0) || pickSurSeg(a, b, c) || pickSurSeg(a, b, d) || pickSurSeg(c, d, a) || pickSurSeg(c, d, b);
  for (let i = 0; i < k; i++) { const a = Q[i], b = Q[(i + 1) % k], c = Q[(i + 2) % k]; if (a[0] === b[0] && a[1] === b[1]) return false;
    if (pickOrient(a, b, c) === 0 && (c[0] - b[0]) * (b[0] - a[0]) + (c[1] - b[1]) * (b[1] - a[1]) < 0) return false;
    for (let j = i + 2; j < k; j++) { if (i === 0 && j === k - 1) continue; if (touche(a, b, Q[j], Q[(j + 1) % k])) return false; } }
  return true; }
function pickCompte(Q) { const k = Q.length, xs = Q.map((p) => p[0]), ys = Q.map((p) => p[1]), pts = []; let I = 0, B = 0;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x++) for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
    let bord = false; for (let i = 0; i < k; i++) if (pickSurSeg(Q[i], Q[(i + 1) % k], [x, y])) { bord = true; break; }
    if (bord) { B++; pts.push([x, y, 2]); continue; }
    let c = false; for (let i = 0, j = k - 1; i < k; j = i++) { const [xi, yi] = Q[i], [xj, yj] = Q[j]; if ((yi > y) !== (yj > y)) { const g = (x - xi) * (yj - yi) - (xj - xi) * (y - yi); if (yj > yi ? g < 0 : g > 0) c = !c; } }
    if (c) { I++; pts.push([x, y, 1]); } }
  return { I, B, pts }; }
const pickLacet2 = (Q) => { let s = 0; for (let i = 0; i < Q.length; i++) { const [x1, y1] = Q[i], [x2, y2] = Q[(i + 1) % Q.length]; s += x1 * y2 - x2 * y1; } return Math.abs(s); };
function theoremePick(P, n) {
  const k = P.sommets, R = P.rayon, rng = mulberry32(P.graine); let Q = null;
  for (let essai = 0; essai < 200 && !Q; essai++) { const T = []; for (let i = 0; i < k; i++) { const a = 2 * PI * (i + 0.15 + 0.7 * rng()) / k, r = R * (0.4 + 0.6 * rng()); T.push([Math.round(r * cosD(a)), Math.round(r * sinD(a))]); } if (pickSimple(T)) Q = T; }
  if (!Q) Q = [[0, 0], [R, 0], [0, R]];
  const { I, B, pts } = pickCompte(Q), a2 = pickLacet2(Q); let sg = 0;
  for (let i = 0; i < Q.length; i++) { const a = Q[i], b = Q[(i + 1) % Q.length]; sg += pgcd(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); }
  const papillon = [[0, 0], [4, 4], [4, 0], [0, 4]], tp = pickCompte(papillon);
  const brut = new Float64Array(n * 3), m = Math.floor(n / 2), kq = Q.length;
  for (let l = 0; l < n; l++) { const o = 3 * l; if (l < m) { const t = l * kq / m, s = Math.floor(t), u = t - s, s0 = Q[s], s1 = Q[(s + 1) % kq]; brut[o] = s0[0] + u * (s1[0] - s0[0]); brut[o + 1] = s0[1] + u * (s1[1] - s0[1]); brut[o + 2] = 0; }
    else { const pe = pts[Math.floor((l - m) * pts.length / (n - m))]; brut[o] = pe[0]; brut[o + 1] = pe[1]; brut[o + 2] = pe[2]; } }
  return { D: 3, brut, nuage: true, unite: 'sans objet (points entiers)', invariants: {
    pick: { mesure: a2 - (2 * I + B - 2), formule: 0, aire: a2 / 2, interieurs: I, pointsBord: B, note: 'twice the shoelace area minus (2I + B - 2), I and B counted point by point : Pick says A = I + B/2 - 1' },
    bordPgcd: { mesure: B - sg, formule: 0, polygone: JSON.stringify(Q), note: 'boundary points counted minus the sum over the sides of gcd(|dx|, |dy|)' },
    temoin: { mesure: 2 * tp.I + tp.B - 2, formule: 17, lacet: pickLacet2(papillon), note: 'witness: the bow tie (0,0) (4,4) (4,0) (0,4) crosses itself : the shoelace gives 0, Pick would give 17/2 — Pick needs a simple polygon' } } };
}

// ---------- 24 : percolation de liens, la traversee a p = 1/2 (idee et valeurs : codex Grok Bot ; Bollobas et Riordan 2006, corollaire 5, lu par Grok ; Kesten 1980) ----------
// Reseau carre ; chaque lien est ouvert avec la probabilite 1/2. Rectangle de n+1 cases de large et n de haut : un chemin de liens ouverts
//   relie-t-il le bord gauche au bord droit ? Par dualite (le rectangle dual est le meme tourne d un quart), la reponse est OUI avec la
//   probabilite EXACTEMENT 1/2, quel que soit n.
// Exact ici : les 2^7 et 2^17 configurations des rectangles 2x1 et 3x2 enumerees une par une (64/128, 65 536/131 072 : valeurs de Grok, recomptees).
// Mesure : 400 rectangles tires (graine) a la taille du curseur, fraction traversee contre 1/2 (statistique, sigma = 1/40).
// Temoin : le CARRE 2x2 n a pas cette symetrie : 2 752/4 096, pas 1/2.
// Dessin (vue de face) : un rectangle tire ; des points le long des liens ouverts, etiquette 2 = amas qui traverse, 1 = amas touchant le bord gauche, 0 = autres.
function percoAretes(W, H) { const E = [], id = (x, y) => y * (W + 1) + x;
  for (let y = 0; y <= H; y++) for (let x = 0; x < W; x++) E.push([id(x, y), id(x + 1, y), x, y, 0]);
  for (let y = 0; y < H; y++) for (let x = 0; x <= W; x++) E.push([id(x, y), id(x, y + 1), x, y, 1]); return E; }
function percoAmas(W, H, E, ouvert) { const p = new Int32Array((W + 1) * (H + 1)); for (let i = 0; i < p.length; i++) p[i] = i;
  const f = (a) => { while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; } return a; };
  for (let k = 0; k < E.length; k++) if (ouvert[k]) p[f(E[k][0])] = f(E[k][1]);
  const bord = new Uint8Array(p.length); for (let y = 0; y <= H; y++) { bord[f(y * (W + 1))] |= 1; bord[f(y * (W + 1) + W)] |= 2; }
  let traverse = false; for (let i = 0; i < p.length; i++) if (bord[i] === 3) traverse = true;
  return { f, bord, traverse }; }
const PERCO_EXACT = new Map();
function percoExact(W, H) { const cle = W + 'x' + H; if (PERCO_EXACT.has(cle)) return PERCO_EXACT.get(cle);
  const E = percoAretes(W, H), m = E.length, ouvert = new Uint8Array(m); let t = 0;
  for (let c = 0; c < 2 ** m; c++) { for (let k = 0; k < m; k++) ouvert[k] = (c >> k) & 1; if (percoAmas(W, H, E, ouvert).traverse) t++; }
  const r = { t, total: 2 ** m }; PERCO_EXACT.set(cle, r); return r; }
function percolationLiens(P, n) {
  const N = P.cote, W = N + 1, H = N, rng = mulberry32(P.graine), E = percoAretes(W, H), m = E.length, PARTIES = 400;
  const e1 = percoExact(2, 1), e2 = percoExact(3, 2), carre = percoExact(2, 2), ouvert = new Uint8Array(m); let ok = 0;
  for (let j = 0; j < PARTIES; j++) { for (let k = 0; k < m; k++) ouvert[k] = rng() < 0.5 ? 1 : 0; if (percoAmas(W, H, E, ouvert).traverse) ok++; }
  for (let k = 0; k < m; k++) ouvert[k] = rng() < 0.5 ? 1 : 0;
  const A = percoAmas(W, H, E, ouvert), liens = [];
  for (let k = 0; k < m; k++) if (ouvert[k]) { const b = A.bord[A.f(E[k][0])]; liens.push([E[k][2], E[k][3], E[k][4], b === 3 ? 2 : b & 1 ? 1 : 0]); }
  if (!liens.length) liens.push([0, 0, 0, 0]);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const o = 3 * l, t = l * liens.length / n, s = Math.floor(t), u = t - s, li = liens[s]; brut[o] = li[0] + (li[2] === 0 ? u : 0); brut[o + 1] = li[1] + (li[2] === 1 ? u : 0); brut[o + 2] = li[3]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (liens du reseau)', invariants: {
    dualite: { mesure: Math.abs(e1.t / e1.total - 0.5) + Math.abs(e2.t / e2.total - 0.5), formule: 0, n1: e1.t + '/' + e1.total, n2: e2.t + '/' + e2.total, note: 'every configuration of the 2 x 1 and 3 x 2 rectangles enumerated : distance of the crossing probability from 1/2, added for both (duality says 0 for every n)' },
    simulee: { mesure: ok / PARTIES, formule: 0.5, sigma: Math.sqrt(0.25 / PARTIES), parties: PARTIES, note: 'share of 400 random (n+1) x n rectangles crossed left to right, against 1/2 (statistical)' },
    temoin: { mesure: carre.t + '/' + carre.total, formule: '2752/4096', note: 'witness: the 2 x 2 SQUARE is not self-dual : crossed in 2752 of 4096 configurations, not half' } } };
}

// ---------- 25 : le theoreme de Napoleon (idee et valeurs : codex Grok Bot) ----------
// Sur chaque cote d un triangle, un triangle equilateral pose vers l EXTERIEUR : leurs trois centres forment un triangle equilateral.
// Exact ici : tout est calcule dans Q(sqrt 3) (nombres a + b sqrt 3, a et b fractions BigInt) : la rotation de 60 degres n a besoin
//   que de 1/2 et sqrt(3)/2 ; les trois cotes au carre du triangle des centres sont compares A L IDENTIQUE, sans arrondi.
// Aussi exact : avec les equilateraux vers l INTERIEUR, encore un triangle equilateral, et (aire exterieure) - (aire interieure) = aire du triangle.
// Triangle : sommets entiers tires (graine) dans une grille de la taille du curseur, sens direct, jamais plat.
// Temoin : des CARRES a la place des equilateraux (triangle (0,0) (6,0) (0,8) de Grok) : centres a 116, 130, 98 au carre — pas equilateral.
// Dessin (vue de face) : le triangle, les trois equilateraux exterieurs, le triangle de Napoleon ; etiquette 0, 1, 2.
const napG = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const napF = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } const k = napG(n, d) || 1n; return [n / k, d / k]; };
const napFA = (x, y) => napF(x[0] * y[1] + y[0] * x[1], x[1] * y[1]), napFM = (x, y) => napF(x[0] * y[0], x[1] * y[1]);
const napQA = (x, y) => [napFA(x[0], y[0]), napFA(x[1], y[1])], napQN = (x) => [[-x[0][0], x[0][1]], [-x[1][0], x[1][1]]], napQS = (x, y) => napQA(x, napQN(y));
const napQM = (x, y) => [napFA(napFM(x[0], y[0]), napFM(napFM(x[1], y[1]), [3n, 1n])), napFA(napFM(x[0], y[1]), napFM(x[1], y[0]))];
const napEgal = (x, y) => x[0][0] === y[0][0] && x[0][1] === y[0][1] && x[1][0] === y[1][0] && x[1][1] === y[1][1];
const napTexte = (x) => x[0][0] + (x[0][1] === 1n ? '' : '/' + x[0][1]) + ' + ' + x[1][0] + (x[1][1] === 1n ? '' : '/' + x[1][1]) + ' sqrt3';
const napReel = (x) => Number(x[0][0]) / Number(x[0][1]) + (Number(x[1][0]) / Number(x[1][1])) * 1.7320508075688772;
const NAP_DEMI = [[1n, 2n], [0n, 1n]], NAP_R = [[0n, 1n], [1n, 2n]], NAP_TIERS = [[1n, 3n], [0n, 1n]];
/* 3e sommet : rotation de -60 degres de (Q - P) autour de P (exterieur pour un triangle direct) */
function napSommet(P, Q) { const dx = napQS(Q[0], P[0]), dy = napQS(Q[1], P[1]);
  return [napQA(P[0], napQA(napQM(dx, NAP_DEMI), napQM(dy, NAP_R))), napQA(P[1], napQA(napQN(napQM(dx, NAP_R)), napQM(dy, NAP_DEMI)))]; }
const napCentre = (A, B, C) => [napQM(napQA(napQA(A[0], B[0]), C[0]), NAP_TIERS), napQM(napQA(napQA(A[1], B[1]), C[1]), NAP_TIERS)];
const napD2 = (U, V) => { const dx = napQS(U[0], V[0]), dy = napQS(U[1], V[1]); return napQA(napQM(dx, dx), napQM(dy, dy)); };
function napTriangle(S, exterieur) { const ext = (P, Q) => exterieur ? napSommet(P, Q) : napSommet(Q, P), [A, B, C] = S;
  const E = [ext(A, B), ext(B, C), ext(C, A)], G = [napCentre(A, B, E[0]), napCentre(B, C, E[1]), napCentre(C, A, E[2])];
  return { E, G, c2: [napD2(G[0], G[1]), napD2(G[1], G[2]), napD2(G[2], G[0])] }; }
function napoleon(P, n) {
  const L = P.taille, rng = mulberry32(P.graine); let T = null;
  while (!T) { const t = [0, 1, 2].map(() => [Math.floor(rng() * (L + 1)), Math.floor(rng() * (L + 1))]), cr = (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]);
    if (cr > 0) T = t; else if (cr < 0) T = [t[0], t[2], t[1]]; }
  const S = T.map(([x, y]) => [[[BigInt(x), 1n], [0n, 1n]], [[BigInt(y), 1n], [0n, 1n]]]), X = napTriangle(S, true), I = napTriangle(S, false);
  const egaux = (c) => (napEgal(c[0], c[1]) ? 0 : 1) + (napEgal(c[1], c[2]) ? 0 : 1);
  /* aire d un equilateral de cote^2 = s : (sqrt3 / 4) s ; difference exterieur - interieur contre l aire du triangle (rationnelle) */
  const aire2 = (T[1][0] - T[0][0]) * (T[2][1] - T[0][1]) - (T[1][1] - T[0][1]) * (T[2][0] - T[0][0]), R34 = [[0n, 1n], [1n, 4n]];
  const ecartAires = napQS(napQM(napQS(X.c2[0], I.c2[0]), R34), [[BigInt(aire2), 2n], [0n, 1n]]);
  const tc = [[0, 0], [6, 0], [0, 8]], cc = (p, q) => [p[0] + q[0] + (q[1] - p[1]), p[1] + q[1] - (q[0] - p[0])], Gc = [cc(tc[0], tc[1]), cc(tc[1], tc[2]), cc(tc[2], tc[0])];
  const dc = (u, v) => ((u[0] - v[0]) ** 2 + (u[1] - v[1]) ** 2) / 4, carres = [dc(Gc[0], Gc[1]), dc(Gc[1], Gc[2]), dc(Gc[2], Gc[0])];
  const segs = []; const pt = (q) => [napReel(q[0]), napReel(q[1])];
  for (let i = 0; i < 3; i++) segs.push([pt(S[i]), pt(S[(i + 1) % 3]), 0]);
  for (let i = 0; i < 3; i++) { segs.push([pt(S[i]), pt(X.E[i]), 1]); segs.push([pt(X.E[i]), pt(S[(i + 1) % 3]), 1]); }
  for (let i = 0; i < 3; i++) segs.push([pt(X.G[i]), pt(X.G[(i + 1) % 3]), 2]);
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const o = 3 * l, t = l * segs.length / n, s = Math.floor(t), u = t - s, sg = segs[s];
    brut[o] = sg[0][0] + u * (sg[1][0] - sg[0][0]); brut[o + 1] = sg[0][1] + u * (sg[1][1] - sg[0][1]); brut[o + 2] = sg[2]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet (cases de la grille)', invariants: {
    equilateral: { mesure: egaux(X.c2), formule: 0, cote2: napTexte(X.c2[0]), triangle: JSON.stringify(T), note: 'pairs of sides of the outer Napoleon triangle whose squares differ, compared exactly in Q(sqrt 3)' },
    interieur: { mesure: egaux(I.c2), formule: 0, cote2: napTexte(I.c2[0]), note: 'same with the equilateral triangles turned inwards : still equilateral' },
    aires: { mesure: napReel(ecartAires), formule: 0, exact: napTexte(ecartAires), note: 'area of the outer Napoleon triangle minus the inner one, minus the area of the triangle : exactly 0' },
    temoin: { mesure: carres.join(', '), formule: '116, 130, 98', note: 'witness: squares instead of equilateral triangles on (0,0) (6,0) (0,8) : the centres are 116, 130, 98 apart (squared), not equilateral' } } };
}

// ---------- 26 : le billard elliptique et sa caustique (idee et valeurs : codex Grok Bot ; « Ivory revisited », Integrable Systems 2017, lu par Grok) ----------
// Une bille rebondit dans l ellipse x^2 + y^2/b^2 = 1 (angle d incidence = angle de reflexion). Chaque corde reste tangente a UNE MEME conique
//   confocale x^2/(1 - L) + y^2/(b^2 - L) = 1 : une ellipse (L < b^2) si la bille ne passe jamais entre les foyers, une hyperbole sinon.
// Mesure : pour chaque corde, de normale unitaire n et de distance d au centre, L = n1^2 + b^2 n2^2 - d^2 (condition de tangence, derivee :
//   une droite n.x = d touche x^2/A + y^2/B = 1 ssi A n1^2 + B n2^2 = d^2) ; on suit son ecart au premier L sur tous les rebonds.
// Aussi : chaque point d impact verifie |PF1| + |PF2| = 2 (foyers a +- sqrt(1 - b^2)).
// Temoin : meme bille, mais reflechie sur la normale RADIALE (celle du cercle) au lieu de la vraie normale : L derive.
// Dessin (vue de face) : l ellipse (0), la trajectoire (1), la caustique (2).
function billardTrace(b, t0, tir, N, radiale) {
  const b2 = b * b; let p = [cosD(t0), b * sinD(t0)], v = [cosD(tir), sinD(tir)];
  if (v[0] * p[0] + v[1] * p[1] / b2 > 0) v = [-v[0], -v[1]]; /* vers l interieur */
  const L = [], pts = [p]; let foyers = 0; const c = Math.sqrt(1 - b2);
  for (let k = 0; k < N; k++) {
    const A = v[0] * v[0] + v[1] * v[1] / b2, B = 2 * (p[0] * v[0] + p[1] * v[1] / b2), C = p[0] * p[0] + p[1] * p[1] / b2 - 1;
    const t = (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A), q = [p[0] + t * v[0], p[1] + t * v[1]];
    const n = [-v[1], v[0]], d = n[0] * p[0] + n[1] * p[1]; L.push(n[0] * n[0] + b2 * n[1] * n[1] - d * d);
    let g = radiale ? [q[0], q[1]] : [q[0], q[1] / b2]; const gl = Math.sqrt(g[0] * g[0] + g[1] * g[1]); g = [g[0] / gl, g[1] / gl];
    const vg = v[0] * g[0] + v[1] * g[1]; v = [v[0] - 2 * vg * g[0], v[1] - 2 * vg * g[1]];
    const s = Math.sqrt(q[0] * q[0] + q[1] * q[1] / b2); p = [q[0] / s, q[1] / s]; pts.push(p);
    foyers = Math.max(foyers, Math.abs(Math.sqrt((p[0] - c) ** 2 + p[1] ** 2) + Math.sqrt((p[0] + c) ** 2 + p[1] ** 2) - 2));
  }
  let derive = 0; for (const l of L) derive = Math.max(derive, Math.abs(l - L[0]));
  return { L0: L[0], derive, foyers, pts };
}
function billardElliptique(P, n) {
  const b = P.petitAxe, b2 = b * b, t0 = P.lancer * PI / 180, tir = P.tir * PI / 180, N = P.rebonds;
  const R = billardTrace(b, t0, tir, N, false), F = billardTrace(b, t0, tir, N, true), L0 = R.L0, ellipse = L0 < b2;
  const segs = [], DESSINES = N;
  for (let k = 0; k < DESSINES; k++) segs.push([R.pts[k], R.pts[k + 1], 1]);
  const bord = [], caus = [], M = 120;
  for (let i = 0; i < M; i++) { const a = 2 * PI * i / M; bord.push([cosD(a), b * sinD(a)]); }
  if (ellipse) for (let i = 0; i < M; i++) { const a = 2 * PI * i / M; caus.push([Math.sqrt(1 - L0) * cosD(a), Math.sqrt(b2 - L0) * sinD(a)]); }
  else for (let i = 0; i <= M; i++) { const y = -b + 2 * b * i / M, x = Math.sqrt(1 - L0) * Math.sqrt(1 + y * y / (L0 - b2)); for (const sx of [x, -x]) if (sx * sx + y * y / b2 <= 1) caus.push([sx, y]); }
  const brut = new Float64Array(n * 3), n0 = Math.floor(n / 6), n2 = caus.length ? Math.floor(n / 6) : 0, n1 = n - n0 - n2;
  for (let l = 0; l < n; l++) { const o = 3 * l; let x, y, e;
    if (l < n0) { const q = bord[Math.floor(l * M / n0)]; x = q[0]; y = q[1]; e = 0; }
    else if (l < n0 + n2) { const q = caus[Math.floor((l - n0) * caus.length / n2)]; x = q[0]; y = q[1]; e = 2; }
    else { const t = (l - n0 - n2) * segs.length / n1, s = Math.floor(t), u = t - s, sg = segs[s]; x = sg[0][0] + u * (sg[1][0] - sg[0][0]); y = sg[0][1] + u * (sg[1][1] - sg[0][1]); e = 1; }
    brut[o] = x; brut[o + 1] = y; brut[o + 2] = e; }
  return { D: 3, brut, nuage: true, unite: 'demi-grand axe = 1', invariants: {
    caustique: { mesure: R.derive, formule: 0, lambda0: L0, typeCaustique: ellipse ? 'ellipse (never between the foci)' : 'hyperbola (crosses between the foci)', rebonds: N, note: 'largest change of the confocal parameter L of the chords over all bounces (every chord touches the same confocal conic)' },
    foyers: { mesure: R.foyers, formule: 0, note: 'largest | |PF1| + |PF2| - 2 | over the bounce points' },
    temoin: { mesure: F.derive, note: 'witness: reflecting on the radial normal (the circle s) instead of the true one : L drifts' } } };
}

// ---------- 27 : le theoreme de Feuerbach (idee et valeurs : codex Grok Bot ; Scheer, Forum Geometricorum 11 (2011), theoreme 5, lu par Grok) ----------
// Le cercle des neuf points (centre N, rayon R/2) touche le cercle inscrit de l INTERIEUR (NI = R/2 - r) et les trois cercles exinscrits de
//   l EXTERIEUR (N I_a = R/2 + r_a, ...).
// Exact ici : triangles a sommets ENTIERS et cotes ENTIERS (A = (0,0), B = (p,0), C = (x,y), |AC| et |BC| entiers), tires (graine) parmi ceux
//   de la grille du curseur : R = abc/4K, r = K/s, r_a = K/(s - a), O, H = A + B + C - 2O, N = (O + H)/2, I et les excentres (barycentres
//   ponderes par +-a, b, c) sont tous RATIONNELS ; les quatre tangences sont comparees au carre, en fractions BigInt, A L IDENTIQUE.
// Temoin : le cercle CIRCONSCRIT n est pas tangent au cercle inscrit : OI^2 = R^2 - 2Rr (Euler), pas (R - r)^2.
// Dessin (vue de face) : le triangle (0), le cercle des neuf points (1), le cercle inscrit (2), les trois cercles exinscrits (3).
const feuG = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const feuF = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } const k = feuG(n, d) || 1n; return [n / k, d / k]; };
const feuAdd = (x, y) => feuF(x[0] * y[1] + y[0] * x[1], x[1] * y[1]), feuSub = (x, y) => feuAdd(x, [-y[0], y[1]]);
const feuMul = (x, y) => feuF(x[0] * y[0], x[1] * y[1]), feuDiv = (x, y) => feuF(x[0] * y[1], x[1] * y[0]);
const feuEq = (x, y) => x[0] === y[0] && x[1] === y[1], feuE = (n) => [BigInt(n), 1n], feuNb = (x) => Number(x[0]) / Number(x[1]);
const feuTexte = (x) => x[0] + (x[1] === 1n ? '' : '/' + x[1]);
function feuTriangles(L) { const T = [], rc = (n) => { const r = Math.round(Math.sqrt(n)); return r * r === n ? r : -1; };
  for (let p = 1; p <= L; p++) for (let x = -L; x <= 2 * L; x++) for (let y = 1; y <= L; y++) { const b = rc(x * x + y * y), a = rc((p - x) ** 2 + y * y); if (b > 0 && a > 0 && !(a === b && b === p)) T.push([p, x, y, a, b]); }
  return T; }
function feuCalcul([p, x, y, a, b]) {
  const c = p, A = [feuE(0), feuE(0)], B = [feuE(p), feuE(0)], C = [feuE(x), feuE(y)], K = feuDiv(feuE(p * y), feuE(2)), s = feuDiv(feuE(a + b + c), feuE(2));
  const R = feuDiv(feuE(a * b * c), feuMul(feuE(4), K)), r = feuDiv(K, s), ra = feuDiv(K, feuSub(s, feuE(a))), rb = feuDiv(K, feuSub(s, feuE(b))), rcx = feuDiv(K, feuSub(s, feuE(c)));
  const O = [feuF(BigInt(p), 2n), feuDiv(feuSub(feuE(x * x + y * y), feuE(p * x)), feuE(2 * y))];
  const H = [feuSub(feuAdd(feuAdd(A[0], B[0]), C[0]), feuMul(feuE(2), O[0])), feuSub(feuAdd(feuAdd(A[1], B[1]), C[1]), feuMul(feuE(2), O[1]))];
  const N = [feuDiv(feuAdd(O[0], H[0]), feuE(2)), feuDiv(feuAdd(O[1], H[1]), feuE(2))];
  const bar = (wa, wb, wc) => { const S = feuE(wa + wb + wc); return [feuDiv(feuAdd(feuAdd(feuMul(feuE(wa), A[0]), feuMul(feuE(wb), B[0])), feuMul(feuE(wc), C[0])), S), feuDiv(feuAdd(feuAdd(feuMul(feuE(wa), A[1]), feuMul(feuE(wb), B[1])), feuMul(feuE(wc), C[1])), S)]; };
  const I = bar(a, b, c), Ia = bar(-a, b, c), Ib = bar(a, -b, c), Ic = bar(a, b, -c);
  const d2 = (U, V) => feuAdd(feuMul(feuSub(U[0], V[0]), feuSub(U[0], V[0])), feuMul(feuSub(U[1], V[1]), feuSub(U[1], V[1]))), carre = (z) => feuMul(z, z), R2 = feuDiv(R, feuE(2));
  return { R, r, ra, rb, rcx, O, N, I, Ia, Ib, Ic, R2, interne: feuEq(d2(N, I), carre(feuSub(R2, r))),
    externes: [[Ia, ra], [Ib, rb], [Ic, rcx]].filter(([P, q]) => !feuEq(d2(N, P), carre(feuAdd(R2, q)))).length,
    neuf: feuEq(d2(N, [feuF(BigInt(p), 2n), feuE(0)]), carre(R2)), oi2: d2(O, I), rMoinsR2: carre(feuSub(R, r)), euler: feuSub(carre(R), feuMul(feuE(2), feuMul(R, r))) };
}
function feuerbach(P, n) {
  const T = feuTriangles(P.taille), rng = mulberry32(P.graine), t = T[Math.floor(rng() * T.length)], F = feuCalcul(t), [p, x, y] = t;
  const cercles = [[F.N, F.R2, 1], [F.I, F.r, 2], [F.Ia, F.ra, 3], [F.Ib, F.rb, 3], [F.Ic, F.rcx, 3]], brut = new Float64Array(n * 3), S = [[0, 0], [p, 0], [x, y]];
  const n0 = Math.floor(n / 5), parC = Math.max(1, Math.floor((n - n0) / 5)); /* petit n : jamais 0/0 */
  for (let l = 0; l < n; l++) { const o = 3 * l;
    if (l < n0) { const u = 3 * l / n0, k = Math.floor(u), v = u - k, P0 = S[k], P1 = S[(k + 1) % 3]; brut[o] = P0[0] + v * (P1[0] - P0[0]); brut[o + 1] = P0[1] + v * (P1[1] - P0[1]); brut[o + 2] = 0; continue; }
    const j = Math.min(4, Math.floor((l - n0) / parC)), q = (l - n0 - j * parC) / parC, [Cc, rr, e] = cercles[j], ang = 2 * PI * q;
    brut[o] = feuNb(Cc[0]) + feuNb(rr) * cosD(ang); brut[o + 1] = feuNb(Cc[1]) + feuNb(rr) * sinD(ang); brut[o + 2] = e; }
  return { D: 3, brut, nuage: true, unite: 'cases de la grille', invariants: {
    interne: { mesure: F.interne ? 0 : 1, formule: 0, triangle: JSON.stringify(S), note: 'nine-point circle and incircle : NI^2 = (R/2 - r)^2 compared exactly in fractions (0 = they touch from inside)' },
    externes: { mesure: F.externes, formule: 0, rayons: [F.R, F.r, F.ra, F.rb, F.rcx].map(feuTexte).join(', '), note: 'excircles NOT touching the nine-point circle from outside (N I_a = R/2 + r_a, exact) ; rayons = R, r, r_a, r_b, r_c' },
    neufPoints: { mesure: F.neuf ? 0 : 1, formule: 0, note: 'the circle centred at N = (O + H)/2 with radius R/2 passes through the midpoint of AB (exact)' },
    temoin: { mesure: feuTexte(F.oi2), formule: feuTexte(F.euler), carreRmoinsr: feuTexte(F.rMoinsR2), note: 'witness: the CIRCUMcircle does not touch the incircle : OI^2 = R^2 - 2Rr (Euler), not (R - r)^2' } } };
}

// ---------- 28 : le jeu de la vie, trois oscillateurs (idee et valeurs : codex Grok Bot ; LifeWiki « Blinker », « Pulsar », « Pentadecathlon », lus par Grok) ----------
// Regle de Conway B3/S23 sur le plan ENTIER (un ensemble de cellules, aucun bord, aucun tore) : une case nait avec exactement 3 voisines,
//   survit avec 2 ou 3. Un oscillateur revient a SA forme, au meme endroit, apres p generations.
// Exact ici : on fait evoluer le motif et on compare l ensemble des cellules a celui du depart, case par case : la PREMIERE egalite donne
//   la periode minimale. Clignotant 3 cellules -> 2 ; pulsar 48 -> 3 ; pentadecathlon 12 -> 15.
// Temoin : le PLANEUR ne revient jamais sur lui-meme (4 fois la plus grande periode essayee), mais apres 4 generations il est exactement
//   lui-meme decale d une case en diagonale : il voyage, il n oscille pas.
// Dessin (vue de face) : toutes les phases d une periode, etiquette = la generation (0 .. p - 1).
const vieCle = (x, y) => x + ',' + y;
function viePas(S) { const n = new Map();
  for (const k of S) { const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) { const c = vieCle(x + dx, y + dy); n.set(c, (n.get(c) || 0) + 1); } }
  const T = new Set(); for (const [c, v] of n) if (v === 3 || (v === 2 && S.has(c))) T.add(c); return T; }
const vieEgal = (A, B) => A.size === B.size && [...A].every((k) => B.has(k));
function vieRle(s) { const S = new Set(); let x = 0, y = 0, n = '';
  for (const ch of s) { if (ch >= '0' && ch <= '9') { n += ch; continue; } const k = n ? +n : 1; n = '';
    if (ch === 'b') x += k; else if (ch === 'o') { for (let i = 0; i < k; i++) S.add(vieCle(x + i, y)); x += k; } else if (ch === '$') { y += k; x = 0; } else if (ch === '!') break; }
  return S; }
const VIE_MOTIFS = [['blinker', '3o!', 2], ['pulsar', '2b3o3b3o2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!', 3], ['pentadecathlon', '2bo4bo$2ob4ob2o$2bo4bo!', 15]];
function jeuDeLaVie(P, n) {
  const [nom, rle, attendue] = VIE_MOTIFS[P.oscillateur], S0 = vieRle(rle), MAX = 60, phases = [S0]; let S = S0, p = null;
  for (let t = 1; t <= MAX && p === null; t++) { S = viePas(S); if (vieEgal(S, S0)) p = t; else phases.push(S); }
  const planeur = vieRle('bo$2bo$3o!'); let G = planeur, retour = null; for (let t = 1; t <= 60 && retour === null; t++) { G = viePas(G); if (vieEgal(G, planeur)) retour = t; }
  let G4 = planeur; for (let t = 0; t < 4; t++) G4 = viePas(G4);
  const decale = new Set([...planeur].map((k) => { const i = k.indexOf(','); return vieCle(+k.slice(0, i) + 1, +k.slice(i + 1) + 1); }));
  const points = []; phases.forEach((Ph, t) => { for (const k of Ph) { const i = k.indexOf(','); points.push([+k.slice(0, i), -(+k.slice(i + 1)), t]); } });
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const ce = points[Math.floor(l * points.length / n)], o = 3 * l; brut[o] = ce[0]; brut[o + 1] = ce[1]; brut[o + 2] = ce[2]; }
  return { D: 3, brut, nuage: true, unite: 'cases', invariants: {
    retour: { mesure: p === null ? NaN : p, formule: attendue, motif: nom, vivantes: S0.size, absente: 'no return within ' + MAX + ' generations', note: 'first generation where the whole set of live cells equals the starting set, cell by cell (= the smallest period)' },
    temoin: { mesure: retour === null && vieEgal(G4, decale) ? 'never returns ; after 4 = itself moved (1,1)' : 'returns or does not move', formule: 'never returns ; after 4 = itself moved (1,1)', note: 'witness: the glider never comes back to the same place (60 generations) : after 4 it is itself, one cell down and right — it travels' } } };
}

// ---------- 29 : les marches auto-evitantes (idee et valeurs : codex Grok Bot ; OEIS A001411, lu par Grok) ----------
// Une marche de n pas sur le quadrillage, partant de l origine, qui ne repasse JAMAIS par un point deja visite. Combien y en a-t-il ?
//   Aucune formule fermee n est connue : on les COMPTE, toutes, par un parcours en profondeur (c(12) = 324 932).
// Exact ici : c(1..n) contre la suite A001411 relevee par Grok (n <= 12) ; et une loi derivee : couper une marche de m + k pas en deux donne
//   deux marches auto-evitantes, donc c(m + k) <= c(m) c(k) pour tout m + k <= n (sous-multiplicativite), verifiee sur toutes les paires.
// Temoin : « ne jamais revenir en arriere » n est pas « ne jamais se recroiser » : 4 x 3^(k-1) marches sans demi-tour, egal a c(k) pour
//   k <= 3, plus grand des k = 4 (108 contre 100 : le petit carre referme).
// Dessin (vue de face) : la marche numero j (graine) parmi les c(n), dans l ordre du parcours ; etiquette = le numero du pas.
const SAW_A001411 = [1, 4, 12, 36, 100, 284, 780, 2172, 5916, 16268, 44100, 120292, 324932];
function sawParcours(N, cible) { const T = 2 * N + 3, vu = new Uint8Array(T * T), c = new Array(N + 1).fill(0), DIR = [1, -1, T, -T], chemin = [];
  let trouve = null, rang = 0; const o = (N + 1) * T + N + 1;
  const dfs = (p, k) => { c[k]++; chemin.push(p); if (k === N) { if (rang === cible) trouve = chemin.slice(); rang++; } else for (const d of DIR) { const q = p + d; if (!vu[q]) { vu[q] = 1; dfs(q, k + 1); vu[q] = 0; } } chemin.pop(); };
  vu[o] = 1; dfs(o, 0); return { c, trouve: trouve && trouve.map((p) => [(p % T) - (N + 1), Math.floor(p / T) - (N + 1)]) }; }
function marcheAutoEvitante(P, n) {
  const N = P.etapes, rng = mulberry32(P.graine), total = SAW_A001411[N], cible = Math.floor(rng() * total), R = sawParcours(N, cible), c = R.c;
  let ecarts = 0; for (let k = 0; k <= N; k++) if (c[k] !== SAW_A001411[k]) ecarts++;
  let violations = 0; for (let m = 1; m < N; m++) for (let k = 1; m + k <= N; k++) if (c[m + k] > c[m] * c[k]) violations++;
  let premier = null; for (let k = 1; k <= N && premier === null; k++) if (4 * 3 ** (k - 1) !== c[k]) premier = k;
  const pts = R.trouve, brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const t = l * N / n, s = Math.floor(t), u = t - s, de = pts[s], vers = pts[s + 1], o = 3 * l; brut[o] = de[0] + u * (vers[0] - de[0]); brut[o + 1] = de[1] + u * (vers[1] - de[1]); brut[o + 2] = s; }
  return { D: 3, brut, nuage: true, unite: 'pas du quadrillage', invariants: {
    comptes: { mesure: ecarts, formule: 0, cn: c[N], marche: cible + 1, chemin: JSON.stringify(pts), note: 'lengths k = 0..n where the walks counted one by one disagree with OEIS A001411 ; cn = c(n) ; marche = which walk is drawn' },
    sousMult: { mesure: violations, formule: 0, note: 'pairs (m, k) with m + k <= n where c(m + k) > c(m) c(k) (cutting a walk in two must give two self-avoiding walks)' },
    temoin: { mesure: premier === null ? NaN : premier, formule: 4, absente: 'n too small for the first closed square', nonRetour: N >= 4 ? 4 * 27 : null, note: 'witness: first length where the 4 x 3^(k-1) walks that never step straight back outnumber the self-avoiding ones (k = 4 : 108 vs 100)' } } };
}

// ---------- 30 : la formule d Euler sur des solides non platoniciens (idee et valeurs : codex Grok Bot ; Wikipedia « List of uniform polyhedra », lu par Grok) ----------
// Pour un polyedre convexe (une sphere deformee), sommets - aretes + faces = 2. Ici les trois nombres sont MESURES depuis les coordonnees :
//   V = les points ; E = les paires de points a la plus petite distance (tous ces solides ont des aretes egales) ; F = les plans d appui
//   distincts (passant par deux aretes qui se suivent, tous les autres sommets du meme cote). Aucun des trois n est deduit des deux autres.
// Aussi : chaque arete borde deux faces, donc la somme des sommets de chaque face vaut 2E (verifie face par face).
// Solides : 0 prisme triangulaire, 1 antiprisme carre, 2 cuboctaedre, 3 icosaedre tronque (ballon de football), 4 rhombicuboctaedre,
//   5 dodecaedre adouci (game173 : orbite du point p sous les rotations M1, M2, xi racine reelle de xi^3 + 2 xi^2 = phi^2 — Wikipedia
//   « Snub dodecahedron », lu par Grok ; aretes de longueur 2 xi sqrt(1 - xi)).
// Temoin : un cadre carre (tore polyedrique, 16 faces quadrilateres) : V - E + F = 0, pas 2 — la formule vaut pour la sphere, pas pour un trou.
// Dessin (3-D) : les aretes du solide.
const EUL_PHI = (1 + Math.sqrt(5)) / 2, EUL_R2 = 1 + Math.SQRT2;
const eulPerms = (v, pair) => { const [a, b, c] = v; return pair ? [[a, b, c], [b, c, a], [c, a, b]] : [[a, b, c], [b, c, a], [c, a, b], [b, a, c], [a, c, b], [c, b, a]]; };
const eulSignes = (v) => { const r = []; for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) r.push([v[0] * sx, v[1] * sy, v[2] * sz]); return r; };
const eulDist = (p, q) => Math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2);
const eulUniq = (P) => { const r = []; for (const p of P) if (!r.some((q) => eulDist(p, q) < 1e-9)) r.push(p); return r; };
function eulSolide(k) {
  if (k === 0) { const r = []; for (let i = 0; i < 3; i++) { const a = 2 * PI * i / 3; for (const z of [-0.5, 0.5]) r.push([cosD(a) / Math.sqrt(3), sinD(a) / Math.sqrt(3), z]); } return r; }
  if (k === 1) { const r = [], R = 1 / Math.SQRT2, h = Math.sqrt(1 - 2 * R * R * (1 - cosD(PI / 4))) / 2; for (let i = 0; i < 4; i++) { const a = PI * i / 2; r.push([R * cosD(a), R * sinD(a), h]); r.push([R * cosD(a + PI / 4), R * sinD(a + PI / 4), -h]); } return r; }
  if (k === 2) return eulUniq(eulPerms([1, 1, 0]).flatMap(eulSignes));
  if (k === 5) { let x = 0.9; for (let i = 0; i < 60; i++) x -= (x ** 3 + 2 * x ** 2 - EUL_PHI ** 2) / (3 * x * x + 4 * x);
    const f = EUL_PHI, p = [f * f - f * f * x, -(f ** 3) + f * x + 2 * f * x * x, x], M1 = [[1 / (2 * f), -f / 2, 1 / 2], [f / 2, 1 / 2, 1 / (2 * f)], [-1 / 2, 1 / (2 * f), f / 2]], M2 = [[0, 0, 1], [1, 0, 0], [0, 1, 0]];
    const ap = (M, v) => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]), pts = [p];
    for (let i = 0; i < pts.length; i++) for (const M of [M1, M2]) { const q = ap(M, pts[i]); if (!pts.some((r) => eulDist(r, q) < 1e-9)) pts.push(q); }
    return pts; }
  if (k === 3) return eulUniq([[0, 1, 3 * EUL_PHI], [1, 2 + EUL_PHI, 2 * EUL_PHI], [EUL_PHI, 2, 2 * EUL_PHI + 1]].flatMap((v) => eulPerms(v, true)).flatMap(eulSignes));
  return eulUniq(eulPerms([1, 1, EUL_R2], true).flatMap(eulSignes)); }
function eulMesure(P) {
  const V = P.length; let m = Infinity; for (let i = 0; i < V; i++) for (let j = i + 1; j < V; j++) m = Math.min(m, eulDist(P[i], P[j]));
  const vois = P.map(() => []), aretes = []; for (let i = 0; i < V; i++) for (let j = i + 1; j < V; j++) if (Math.abs(eulDist(P[i], P[j]) - m) < 1e-9 * m) { aretes.push([i, j]); vois[i].push(j); vois[j].push(i); }
  const plans = []; let sommetsFaces = 0;
  for (let i = 0; i < V; i++) for (const j of vois[i]) for (const k of vois[i]) { if (j >= k) continue;
    const u = P[j].map((x, t) => x - P[i][t]), w = P[k].map((x, t) => x - P[i][t]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2); if (l < 1e-9) continue;
    const nn = n.map((x) => x / l), c = nn[0] * P[i][0] + nn[1] * P[i][1] + nn[2] * P[i][2]; let pos = 0, neg = 0, sur = 0;
    for (const p of P) { const s = nn[0] * p[0] + nn[1] * p[1] + nn[2] * p[2] - c; if (s > 1e-9) pos++; else if (s < -1e-9) neg++; else sur++; }
    if (pos > 0 && neg > 0) continue; const sg = pos ? -1 : 1, cle = nn.map((x) => x * sg); if (!plans.some((q) => eulDist(q, cle) < 1e-9)) { plans.push(cle); sommetsFaces += sur; } }
  return { V, E: aretes.length, F: plans.length, aretes, sommetsFaces };
}
function eulerSolides(P, n) {
  const S = eulSolide(P.solide), M = eulMesure(S);
  /* temoin : le cadre carre, donne par ses 16 faces ; V et E comptes DEPUIS les faces */
  const id = (int, k, z) => (int ? 4 : 0) + k + (z ? 8 : 0), faces = [];
  for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; faces.push([id(0, k, 0), id(0, k2, 0), id(0, k2, 1), id(0, k, 1)], [id(1, k, 0), id(1, k2, 0), id(1, k2, 1), id(1, k, 1)], [id(0, k, 1), id(0, k2, 1), id(1, k2, 1), id(1, k, 1)], [id(0, k, 0), id(0, k2, 0), id(1, k2, 0), id(1, k, 0)]); }
  const Vt = new Set(faces.flat()).size, Et = new Set(faces.flatMap((f) => f.map((a, i) => { const b = f[(i + 1) % f.length]; return Math.min(a, b) + '-' + Math.max(a, b); }))).size;
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const t = l * M.aretes.length / n, s = Math.floor(t), u = t - s, [i, j] = M.aretes[s], o = 3 * l;
    for (let d = 0; d < 3; d++) brut[o + d] = S[i][d] + u * (S[j][d] - S[i][d]); }
  return { D: 3, brut, nuage: true, unite: 'longueur d arete', invariants: {
    euler: { mesure: M.V - M.E + M.F, formule: 2, sommets: M.V, aretes: M.E, faces: M.F, points: JSON.stringify(S), note: 'vertices - edges + faces, each MEASURED from the coordinates (points, pairs at the shortest distance, supporting planes)' },
    poignees: { mesure: M.sommetsFaces - 2 * M.E, formule: 0, note: 'sum over the faces of their corners, minus 2E : every edge borders exactly two faces' },
    temoin: { mesure: Vt - Et + faces.length, formule: 0, note: 'witness: a square picture frame (a polyhedral torus, 16 four-sided faces) : V - E + F = 0, not 2' } } };
}

// ---------- 31 : le theoreme de Morley (idee et valeurs : codex Grok Bot ; Webster, Mathematics Magazine 43 (1970) 209-210, lu par Grok) ----------
// Couper chaque angle d un triangle en TROIS : les trisectrices voisines d un meme cote se coupent en trois points qui forment TOUJOURS un
//   triangle equilateral, de cote 8 R sin(A/3) sin(B/3) sin(C/3) (Webster), R rayon du cercle circonscrit.
// Mesure : triangle inscrit dans le cercle de rayon 1 (angles A et B au curseur, C = 180 - A - B) ; chaque sommet de Morley = intersection
//   des deux droites issues des extremites d un cote, tournees de A/3 (resp. B/3) vers l interieur ; les trois cotes mesures contre Webster.
// Temoin : avec les QUADRISECTRICES (angles coupes en 4) la meme construction donne un triangle qui n est pas equilateral.
// Dessin (vue de face) : le triangle (0), les trisectrices jusqu a leur point (1), le triangle de Morley (2).
function morleyPoints(A, B, k) {
  const C = PI - A - B, P = [[cosD(PI / 2 + 2 * C), sinD(PI / 2 + 2 * C)], [cosD(PI / 2 + 2 * C + 2 * A), sinD(PI / 2 + 2 * C + 2 * A)], [cosD(PI / 2 + 2 * C + 2 * A + 2 * B), sinD(PI / 2 + 2 * C + 2 * A + 2 * B)]];
  /* sommets sur le cercle unite : l arc oppose a un angle vaut deux fois l angle ; P[0], P[1], P[2] portent les angles B, C, A dans cet ordre
   *   (on les renomme par leurs angles reels plus bas, mesures) */
  const ang = (U, V, W) => { const a = [V[0] - U[0], V[1] - U[1]], b = [W[0] - U[0], W[1] - U[1]], c = (a[0] * b[0] + a[1] * b[1]) / Math.sqrt((a[0] ** 2 + a[1] ** 2) * (b[0] ** 2 + b[1] ** 2)); return atan2D(Math.sqrt(Math.max(0, 1 - c * c)), c); };
  const al = [ang(P[0], P[1], P[2]), ang(P[1], P[2], P[0]), ang(P[2], P[0], P[1])];
  const rot = (v, t) => [v[0] * cosD(t) - v[1] * sinD(t), v[0] * sinD(t) + v[1] * cosD(t)];
  const inter = (U, d1, V, d2) => { const den = d1[0] * d2[1] - d1[1] * d2[0], t = ((V[0] - U[0]) * d2[1] - (V[1] - U[1]) * d2[0]) / den; return [U[0] + t * d1[0], U[1] + t * d1[1]]; };
  const sens = Math.sign((P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0]));
  const M = [], traits = [];
  for (let i = 0; i < 3; i++) { const U = P[i], V = P[(i + 1) % 3], du = [V[0] - U[0], V[1] - U[1]], dv = [U[0] - V[0], U[1] - V[1]];
    const X = inter(U, rot(du, sens * al[i] / k), V, rot(dv, -sens * al[(i + 1) % 3] / k)); M.push(X); traits.push([U, X], [V, X]); }
  return { P, al, M };
}
function morley(P0, n) {
  const A = P0.angleA * PI / 180, B = P0.angleB * PI / 180, T = morleyPoints(A, B, 3), Q = morleyPoints(A, B, 4);
  const d = (U, V) => Math.sqrt((U[0] - V[0]) ** 2 + (U[1] - V[1]) ** 2), cotes = [0, 1, 2].map((i) => d(T.M[i], T.M[(i + 1) % 3])), qc = [0, 1, 2].map((i) => d(Q.M[i], Q.M[(i + 1) % 3]));
  const s = 8 * sinD(T.al[0] / 3) * sinD(T.al[1] / 3) * sinD(T.al[2] / 3); /* R = 1 */
  const segs = []; for (let i = 0; i < 3; i++) { segs.push([T.P[i], T.P[(i + 1) % 3], 0]); segs.push([T.P[i], T.M[i], 1], [T.P[(i + 1) % 3], T.M[i], 1]); segs.push([T.M[i], T.M[(i + 1) % 3], 2]); }
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const t = l * segs.length / n, j = Math.floor(t), u = t - j, sg = segs[j], o = 3 * l;
    brut[o] = sg[0][0] + u * (sg[1][0] - sg[0][0]); brut[o + 1] = sg[0][1] + u * (sg[1][1] - sg[0][1]); brut[o + 2] = sg[2]; }
  const ecartMax = Math.max(...cotes.map((c) => Math.abs(c - s))) / s, spreadQ = (Math.max(...qc) - Math.min(...qc)) / Math.max(...qc);
  return { D: 3, brut, nuage: true, unite: 'rayon du cercle circonscrit = 1', invariants: {
    webster: { mesure: ecartMax, formule: 0, cote: s, troisAngles: T.al.map((a) => a * 180 / PI).map((x) => x.toFixed(9)).join(', '), note: 'largest relative gap between the three measured sides of the Morley triangle and 8 R sin(A/3) sin(B/3) sin(C/3) (R = 1)' },
    temoin: { mesure: spreadQ, note: 'witness: cutting the angles in FOUR instead of three : relative spread of the three sides (not 0 : not equilateral)' } } };
}

// ---------- 32 : le probleme de Bale, 1 + 1/4 + 1/9 + ... = pi^2/6 (idee et valeurs : codex Grok Bot ; Daners, preuve elementaire, lue par Grok) ----------
// Les sommes partielles S_n = 1 + 1/4 + ... + 1/n^2 montent vers pi^2/6 sans jamais l atteindre. Exact ici :
//   S_n en FRACTIONS (BigInt) pour n <= 30 (S_10 = 1968329/1270080, valeurs de Grok) ;
//   l encadrement du reste 1/(n+1) < pi^2/6 - S_n < 1/n (derive : 1/(k(k+1)) < 1/k^2 < 1/(k(k-1)), sommes telescopiques) verifie pour
//   CHAQUE n jusqu au curseur (S_n en somme compensee de Kahan).
// Temoin : la serie des 1/k (sans le carre) depasse pi^2/6 des n = 3 (1 + 1/2 + 1/3 = 11/6) et ne s arrete jamais : elle diverge.
// Dessin (vue de face) : les points (1/n, S_n) (0), la limite pi^2/6 (1), la bande de l encadrement (2).
const BALE_PI2_6 = PI * PI / 6;
function baleFraction(n) { let num = 0n, den = 1n; const g = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
  for (let k = 1n; k <= BigInt(n); k++) { const d = k * k; num = num * d + den; den = den * d; const q = g(num, den); num /= q; den /= q; } return num + '/' + den; }
function bale(P, n) {
  const N = P.termes; let horsBornes = 0; const S = new Float64Array(N + 1);
  let s = 0, comp = 0; /* somme compensee (Kahan) : erreur de l ordre de l epsilon, pas n x epsilon */
  for (let m = 1; m <= N; m++) { const y = 1 / (m * m) - comp, t = s + y; comp = (t - s) - y; s = t; S[m] = s; const r = BALE_PI2_6 - s; if (!(1 / (m + 1) < r && r < 1 / m)) horsBornes++; }
  let h = 0, depasse = null; for (let k = 1; k <= 10 && depasse === null; k++) { h += 1 / k; if (h > BALE_PI2_6) depasse = k; }
  /* abscisse 1/n (de 1 vers 0) : S_n ~ pi^2/6 - 1/n y est presque une droite, et les deux colonnes restent de la meme taille */
  const brut = new Float64Array(n * 3), tiers = Math.ceil(n / 3);
  for (let l = 0; l < n; l++) { const o = 3 * l, j = 1 + Math.floor((l % tiers) * N / tiers), quoi = Math.floor(l / tiers);
    brut[o] = 1 / j; brut[o + 1] = quoi === 0 ? S[j] : quoi === 1 ? BALE_PI2_6 : BALE_PI2_6 - 1 / j + (l % 2 ? 1 / j - 1 / (j + 1) : 0); brut[o + 2] = quoi; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    encadre: { mesure: horsBornes, formule: 0, termes: N, note: 'values of n from 1 to the slider where 1/(n+1) < pi^2/6 - S_n < 1/n fails' },
    sommeExacte: { mesure: baleFraction(Math.min(N, 30)), formule: Math.min(N, 30) === 10 ? '1968329/1270080' : null, rangFraction: Math.min(N, 30), note: 'S_n as an exact fraction (n up to 30)' },
    temoin: { mesure: depasse === null ? NaN : depasse, formule: 3, note: 'witness: without the square, 1 + 1/2 + 1/3 = 11/6 is already above pi^2/6 ; that series grows without end' } } };
}

// ---------- 33 : la droite de Simson (idee et valeurs : codex Grok Bot ; MathWorld « Simson Line », Cut-the-Knot (Wallace 1797), lus par Grok) ----------
// D un point P du cercle circonscrit, on abaisse les perpendiculaires aux trois cotes (aux DROITES, prolongees) : les trois pieds sont ALIGNES.
//   Hors du cercle, ils ne le sont plus (Wallace : le triangle podaire degenere en droite ssi P est sur le cercle).
// Exact ici, en fractions BigInt : triangle a sommets entiers (graine) ; P = seconde intersection du cercle avec la corde issue de A de pente
//   rationnelle corde/7 (le cercle passe par A, point rationnel, donc P l est aussi) ; pieds = projections rationnelles ; alignement = aire
//   signee des trois pieds, exactement 0. Temoin : P repousse hors du cercle (O + 5/4 (P - O)) -> aire non nulle.
// Dessin (vue de face) : le triangle (0), le cercle (1), les perpendiculaires (2), la droite de Simson (3).
function simsonPieds(S, P) { const pieds = [];
  for (let i = 0; i < 3; i++) { const U = S[(i + 1) % 3], V = S[(i + 2) % 3], d = [feuSub(V[0], U[0]), feuSub(V[1], U[1])], w = [feuSub(P[0], U[0]), feuSub(P[1], U[1])];
    const t = feuDiv(feuAdd(feuMul(w[0], d[0]), feuMul(w[1], d[1])), feuAdd(feuMul(d[0], d[0]), feuMul(d[1], d[1]))); pieds.push([feuAdd(U[0], feuMul(t, d[0])), feuAdd(U[1], feuMul(t, d[1]))]); }
  return pieds; }
const simsonAire2 = (F) => feuSub(feuMul(feuSub(F[1][0], F[0][0]), feuSub(F[2][1], F[0][1])), feuMul(feuSub(F[1][1], F[0][1]), feuSub(F[2][0], F[0][0])));
function simsonDroite(P0, n) {
  const L = P0.taille, rng = mulberry32(P0.graine); let T = null;
  while (!T) { const t = [0, 1, 2].map(() => [Math.floor(rng() * (L + 1)), Math.floor(rng() * (L + 1))]); if ((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]) !== 0) T = t; }
  const S = T.map(([x, y]) => [feuE(x), feuE(y)]), [A, B, C] = S;
  /* centre O : intersection des mediatrices (systeme 2 x 2 en fractions) */
  const a1 = feuMul(feuE(2), feuSub(B[0], A[0])), b1 = feuMul(feuE(2), feuSub(B[1], A[1])), c1 = feuSub(feuAdd(feuMul(B[0], B[0]), feuMul(B[1], B[1])), feuAdd(feuMul(A[0], A[0]), feuMul(A[1], A[1])));
  const a2 = feuMul(feuE(2), feuSub(C[0], A[0])), b2 = feuMul(feuE(2), feuSub(C[1], A[1])), c2 = feuSub(feuAdd(feuMul(C[0], C[0]), feuMul(C[1], C[1])), feuAdd(feuMul(A[0], A[0]), feuMul(A[1], A[1])));
  const det = feuSub(feuMul(a1, b2), feuMul(a2, b1)), O = [feuDiv(feuSub(feuMul(c1, b2), feuMul(c2, b1)), det), feuDiv(feuSub(feuMul(a1, c2), feuMul(a2, c1)), det)];
  const d2 = (U, V) => feuAdd(feuMul(feuSub(U[0], V[0]), feuSub(U[0], V[0])), feuMul(feuSub(U[1], V[1]), feuSub(U[1], V[1]))), R2 = d2(O, A);
  /* P = A + s (1, t), s = -2 (A - O).(1, t) / (1 + t^2) ; si la corde est tangente (s = 0), pente suivante */
  let k = P0.corde, P = null; for (let essai = 0; essai < 4 && !P; essai++, k++) { const t = feuF(BigInt(k), 7n), dd = feuAdd(feuE(1), feuMul(t, t));
    const s = feuDiv(feuMul(feuE(-2), feuAdd(feuSub(A[0], O[0]), feuMul(t, feuSub(A[1], O[1])))), dd); if (s[0] !== 0n) P = [feuAdd(A[0], s), feuAdd(A[1], feuMul(s, t))]; }
  const F = simsonPieds(S, P), aire = simsonAire2(F), Q = [feuAdd(O[0], feuMul(feuF(5n, 4n), feuSub(P[0], O[0]))), feuAdd(O[1], feuMul(feuF(5n, 4n), feuSub(P[1], O[1])))], aireQ = simsonAire2(simsonPieds(S, Q));
  const nb = (q) => [feuNb(q[0]), feuNb(q[1])], segs = [];
  for (let i = 0; i < 3; i++) segs.push([T[i], T[(i + 1) % 3], 0]);
  for (let i = 0; i < 3; i++) segs.push([nb(P), nb(F[i]), 2]);
  const Fn = F.map(nb); let i0 = 0, i1 = 1, dm = -1; for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const dv = (Fn[i][0] - Fn[j][0]) ** 2 + (Fn[i][1] - Fn[j][1]) ** 2; if (dv > dm) { dm = dv; i0 = i; i1 = j; } }
  segs.push([Fn[i0], Fn[i1], 3]);
  const r = Math.sqrt(feuNb(R2)), on = nb(O), brut = new Float64Array(n * 3), nc = Math.floor(n / 4);
  for (let l = 0; l < n; l++) { const o = 3 * l;
    if (l < nc) { const a = 2 * PI * l / nc; brut[o] = on[0] + r * cosD(a); brut[o + 1] = on[1] + r * sinD(a); brut[o + 2] = 1; continue; }
    const t = (l - nc) * segs.length / (n - nc), j = Math.floor(t), u = t - j, sg = segs[j]; brut[o] = sg[0][0] + u * (sg[1][0] - sg[0][0]); brut[o + 1] = sg[0][1] + u * (sg[1][1] - sg[0][1]); brut[o + 2] = sg[2]; }
  return { D: 3, brut, nuage: true, unite: 'cases de la grille', invariants: {
    alignes: { mesure: feuNb(aire), formule: 0, exact: feuTexte(aire), triangle: JSON.stringify(T), point: feuTexte(P[0]) + ', ' + feuTexte(P[1]), note: 'twice the signed area of the three feet, exact (0 = on one line)' },
    surCercle: { mesure: feuNb(feuSub(d2(O, P), R2)), formule: 0, note: '|OP|^2 - R^2 in exact fractions (P is on the circumscribed circle)' },
    temoin: { mesure: feuNb(aireQ), exact: feuTexte(aireQ), note: 'witness: P pushed outside the circle (O + 5/4 (P - O)) : the three feet are no longer on one line' } } };
}

// ---------- 34 : parts distinctes = parts impaires (Euler) (idee et valeurs : codex Grok Bot ; OEIS A000009, lu par Grok) ----------
// Le nombre de facons d ecrire n comme somme de parts TOUTES DIFFERENTES egale le nombre de facons de l ecrire avec des parts TOUTES IMPAIRES.
// Exact ici : deux comptages INDEPENDANTS en entiers BigInt (sac a dos 0/1 sur les parts 1..n ; sac a dos non borne sur les parts impaires),
//   compares pour chaque m de 1 a n ; q(1..20) = 1, 1, 2, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 27, 32, 38, 46, 54, 64 (Grok).
// Et la bijection de Glaisher : une partition en parts distinctes tiree au hasard (uniforme, graine) ; chaque part 2^a b (b impair) devient
//   2^a parts egales a b ; on verifie que le resultat est en parts impaires, de somme n, et qu en regroupant (ecriture binaire des
//   multiplicites) on retrouve EXACTEMENT la partition de depart.
// Temoin : « toutes differentes » n est pas « quelconques » : p(n) depasse q(n) des n = 2 (2 = 1 + 1 a une part repetee).
// Dessin (vue de face) : la partition distincte (0, a gauche) et son image impaire (1, a droite), une ligne par part.
function distParts(N) { const q = new Array(N + 1).fill(0n); q[0] = 1n; for (let k = 1; k <= N; k++) for (let m = N; m >= k; m--) q[m] += q[m - k]; return q; }
function distImpaires(N) { const q = new Array(N + 1).fill(0n); q[0] = 1n; for (let k = 1; k <= N; k += 2) for (let m = k; m <= N; m++) q[m] += q[m - k]; return q; }
function distTirage(N, rng) { /* T[m][k] = partitions de m en parts distinctes <= k */
  const T = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0n)); for (let k = 0; k <= N; k++) T[0][k] = 1n;
  for (let m = 1; m <= N; m++) for (let k = 1; k <= N; k++) T[m][k] = T[m][k - 1] + (k <= m ? T[m - k][k - 1] : 0n);
  const parts = []; let m = N, k = N;
  /* a chaque etape : la part k est laissee avec la probabilite T[m][k-1] / T[m][k], prise sinon -> chaque partition a la meme chance */
  while (m > 0) { let u = 0n; for (let i = 0; i < 3; i++) u = (u << 30n) + BigInt(Math.floor(rng() * 1073741824)); u %= T[m][k];
    if (u < T[m][k - 1]) k--; else { parts.push(k); m -= k; k = Math.min(k - 1, m); } }
  return parts; }
function distinctesImpaires(P, n) {
  const N = P.entier, rng = mulberry32(P.graine), A = distParts(N), B = distImpaires(N), tous = partPieces(N);
  let ecarts = 0; for (let m = 1; m <= N; m++) if (A[m] !== B[m]) ecarts++;
  let premier = null; for (let m = 1; m <= N && premier === null; m++) if (tous[m] !== A[m]) premier = m;
  const D0 = distTirage(N, rng), image = [];
  for (const p of D0) { let a = 0, b = p; while (b % 2 === 0) { b /= 2; a++; } for (let i = 0; i < 2 ** a; i++) image.push(b); }
  const mult = new Map(); for (const b of image) mult.set(b, (mult.get(b) || 0) + 1);
  const retour = []; for (const [b, c] of mult) { let r = c, a = 0; while (r) { if (r & 1) retour.push(b * 2 ** a); r >>= 1; a++; } }
  const ok = image.every((b) => b % 2 === 1) && image.reduce((x, y) => x + y, 0) === N && D0.reduce((x, y) => x + y, 0) === N && new Set(D0).size === D0.length
    && retour.sort((x, y) => y - x).join() === [...D0].sort((x, y) => y - x).join();
  const cases = []; D0.forEach((p, r) => { for (let c = 0; c < p; c++) cases.push([c, -r, 0]); });
  const im = [...image].sort((x, y) => y - x), off = Math.max(...D0) + 2; im.forEach((p, r) => { for (let c = 0; c < p; c++) cases.push([off + c, -r, 1]); });
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const cs = cases[Math.floor(l * cases.length / n)], o = 3 * l; brut[o] = cs[0]; brut[o + 1] = cs[1]; brut[o + 2] = cs[2]; }
  return { D: 3, brut, nuage: true, unite: 'cases', invariants: {
    egalite: { mesure: ecarts, formule: 0, qn: String(A[N]), q20: N >= 20 ? A.slice(1, 21).join(', ') : null, note: 'values m = 1..n where the count with distinct parts and the count with odd parts (two separate knapsack counts) differ' },
    glaisher: { mesure: ok ? 0 : 1, formule: 0, distincte: D0.join(' + '), impaire: im.join(' + '), note: 'Glaisher s map : the drawn distinct partition, each part 2^a b split into 2^a parts b, is all odd, sums to n, and merges back to itself' },
    temoin: { mesure: premier === null ? NaN : premier, formule: 2, absente: 'n below 2', note: 'witness: distinct parts is a real restriction : p(n) > q(n) from n = 2 (1 + 1 repeats a part)' } } };
}

// ---------- 35 : les triangulations d un polygone (Catalan) (idee et valeurs : codex Grok Bot) ----------
// Couper un polygone convexe a N cotes en triangles par des diagonales qui ne se croisent pas : il y a C(N - 2) facons (nombres de Catalan).
// Exact ici : T(N) par la decomposition « le triangle pose sur le cote (0, N-1) a son sommet en k » (T(N) = somme T(k + 1) T(N - k)), en
//   BigInt, compare pour chaque polygone de 3 a N cotes a la formule binom(2m, m) / (m + 1), m = N - 2 ; valeurs de Grok : 1, 2, 5, 14, ... 16796.
// Une triangulation tiree uniformement (graine) : on verifie N - 3 diagonales, aucune paire qui se croise, N - 2 triangles.
// Temoin : dans un pentagone il y a binom(5, 2) = 10 paires de diagonales, mais seulement 5 ne se croisent pas : l absence de croisement compte.
// Dessin (vue de face) : le polygone regulier (0), les diagonales tirees (1).
function triCompte(N) { const T = new Array(N + 1).fill(0n); T[2] = 1n; for (let m = 3; m <= N; m++) { let s = 0n; for (let k = 1; k <= m - 2; k++) s += T[k + 1] * T[m - k]; T[m] = s; } return T; }
function triTirage(i, j, T, rng, diag) { /* polygone des sommets i..j (j - i + 1 sommets), uniforme */
  const m = j - i + 1; if (m < 3) return; let u = 0n; for (let r = 0; r < 3; r++) u = (u << 30n) + BigInt(Math.floor(rng() * 1073741824)); u %= T[m];
  for (let k = i + 1; k <= j - 1; k++) { const w = T[k - i + 1] * T[j - k + 1]; if (u < w) { if (k - i >= 2) diag.push([i, k]); if (j - k >= 2) diag.push([k, j]); triTirage(i, k, T, rng, diag); triTirage(k, j, T, rng, diag); return; } u -= w; } }
const triCroise = (a, b) => { const [p, q] = a[0] < a[1] ? a : [a[1], a[0]], [r, s] = b[0] < b[1] ? b : [b[1], b[0]]; return (p < r && r < q && q < s) || (r < p && p < s && s < q); };
function triangulations(P, n) {
  const N = P.cotes, rng = mulberry32(P.graine), T = triCompte(N);
  let ecarts = 0; for (let m = 3; m <= N; m++) if (T[m] !== binomB(2 * (m - 2), m - 2) / BigInt(m - 1)) ecarts++;
  const diag = []; triTirage(0, N - 1, T, rng, diag);
  let croisements = 0; for (let a = 0; a < diag.length; a++) for (let b = a + 1; b < diag.length; b++) if (triCroise(diag[a], diag[b])) croisements++;
  let paires = 0, sansCroiser = 0; const D5 = [[2, 4], [1, 4], [1, 3], [0, 3], [0, 2]]; /* ordre decroissant : le test de croisement sert dans les DEUX sens */ for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) { paires++; if (!triCroise(D5[a], D5[b])) sansCroiser++; }
  const S = Array.from({ length: N }, (_, k) => [cosD(2 * PI * k / N + PI / 2), sinD(2 * PI * k / N + PI / 2)]), segs = [];
  for (let k = 0; k < N; k++) segs.push([S[k], S[(k + 1) % N], 0]); for (const [a, b] of diag) segs.push([S[a], S[b], 1]);
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const t = l * segs.length / n, j = Math.floor(t), u = t - j, sg = segs[j], o = 3 * l;
    brut[o] = sg[0][0] + u * (sg[1][0] - sg[0][0]); brut[o + 1] = sg[0][1] + u * (sg[1][1] - sg[0][1]); brut[o + 2] = sg[2]; }
  return { D: 3, brut, nuage: true, unite: 'rayon 1', invariants: {
    catalan: { mesure: ecarts, formule: 0, tn: String(T[N]), note: 'polygons with 3 to N sides where the triangulation count differs from binom(2m, m)/(m + 1), m = sides - 2' },
    diagonales: { mesure: (diag.length === N - 3 ? 0 : 1) + croisements, formule: 0, tirees: diag.map(([a, b]) => a + '-' + b).join(' '), note: 'the drawn triangulation : wrong number of diagonals (N - 3) plus pairs that cross' },
    temoin: { mesure: sansCroiser + ' / ' + paires, formule: '5 / 10', note: 'witness: a pentagon has 10 pairs of diagonals, only 5 pairs do not cross (one triangulation each)' } } };
}

// ---------- 36 : Ramsey R(3, 3) = 6 (idee et valeurs : codex Grok Bot ; MathWorld « Ramsey Number », Greenwood-Gleason 1955, lus par Grok) ----------
// Colorier chaque arete du graphe complet K_n en rouge ou bleu : a partir de n = 6, il y a FORCEMENT un triangle d une seule couleur.
// Exact ici : TOUTES les 2^(n(n-1)/2) colorations enumerees (n <= 6) ; K_5 en a 12 sans triangle monochrome, K_6 n en a aucune (Grok).
//   Et pour K_5 : dans chacune des 12, chaque couleur forme un cycle de 5 aretes (chaque sommet de degre 2, d un seul tenant).
// Temoin : n interdire que les triangles ROUGES ne suffit pas : K_6 a alors des colorations sans triangle interdit — il faut les deux couleurs.
// Dessin (vue de face) : une coloration tiree (graine) parmi les bonnes (n <= 5), ou quelconque avec son triangle monochrome (n = 6) ;
//   etiquette 0 = rouge, 1 = bleu, 2 = le triangle monochrome trouve.
function ramseyGraphe(n) { const E = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) E.push([i, j]);
  const id = new Map(E.map(([a, b], k) => [a + ',' + b, k])), T = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) T.push([id.get(a + ',' + b), id.get(a + ',' + c), id.get(b + ',' + c)]);
  return { E, T }; }
function ramseyR33(P, n) {
  const N = P.sommetsK, rng = mulberry32(P.graine), { E, T } = ramseyGraphe(N), bonnes = []; let rougeSeul = 0;
  for (let m = 0; m < 2 ** E.length; m++) { let mono = null, rouge = false;
    for (const t of T) { const c = (m >> t[0]) & 1; if (c === ((m >> t[1]) & 1) && c === ((m >> t[2]) & 1)) { if (mono === null) mono = t; if (c === 0) rouge = true; } }
    if (mono === null) bonnes.push(m); if (!rouge) rougeSeul++; }
  let cyclesFaux = 0; if (N === 5) for (const m of bonnes) for (const coul of [0, 1]) { const deg = new Array(5).fill(0), adj = Array.from({ length: 5 }, () => []);
    E.forEach(([a, b], k) => { if (((m >> k) & 1) === coul) { deg[a]++; deg[b]++; adj[a].push(b); adj[b].push(a); } });
    const vu = new Set([0]), pile = [0]; while (pile.length) for (const v of adj[pile.pop()]) if (!vu.has(v)) { vu.add(v); pile.push(v); }
    if (deg.some((d) => d !== 2) || vu.size !== 5) cyclesFaux++; }
  const m = bonnes.length ? bonnes[Math.floor(rng() * bonnes.length)] : Math.floor(rng() * 2 ** E.length);
  let tri = null; for (const t of T) { const c = (m >> t[0]) & 1; if (c === ((m >> t[1]) & 1) && c === ((m >> t[2]) & 1)) { tri = t; break; } }
  const S = Array.from({ length: N }, (_, k) => [cosD(2 * PI * k / N + PI / 2), sinD(2 * PI * k / N + PI / 2)]);
  const segs = E.map(([a, b], k) => [S[a], S[b], tri && tri.includes(k) ? 2 : (m >> k) & 1]);
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const t = l * segs.length / n, j = Math.floor(t), u = t - j, sg = segs[j], o = 3 * l;
    brut[o] = sg[0][0] + u * (sg[1][0] - sg[0][0]); brut[o + 1] = sg[0][1] + u * (sg[1][1] - sg[0][1]); brut[o + 2] = sg[2]; }
  return { D: 3, brut, nuage: true, unite: 'rayon 1', invariants: {
    sansTriangle: { mesure: bonnes.length, formule: N === 5 ? 12 : N === 6 ? 0 : null, colorations: 2 ** E.length, note: 'colourings of the edges of K_n in two colours with no one-colour triangle, all of them enumerated (K_5 : 12, K_6 : 0, so R(3, 3) = 6)' },
    cycles5: { mesure: cyclesFaux, formule: 0, note: 'K_5 only : good colourings where a colour class is NOT a single 5-cycle (every vertex of degree 2, connected)' },
    temoin: { mesure: rougeSeul, note: 'witness: forbidding only RED triangles, this many colourings of K_n survive (for K_6 still many) : both colours are needed' } } };
}

// ---------- 37 : l hexagramme de Pascal (idee et valeurs : codex Grok Bot ; MathWorld « Pascal s Theorem », lu par Grok) ----------
// Six points sur une conique, relies dans l ordre A B C D E F : les cotes opposes (AB et DE, BC et EF, CD et FA) se coupent en trois points
//   ALIGNES — meme si l hexagone se croise lui-meme.
// Exact ici : six points RATIONNELS du cercle unite, t -> ((1 - t^2)/(1 + t^2), 2t/(1 + t^2)), t entiers tires (graine) parmi -9..9 ;
//   les trois intersections en fractions BigInt ; aire signee des trois points, exactement 0.
// Temoin : F remplace par (2, 2), hors du cercle : l aire n est plus nulle.
// Dessin (vue de face) : le cercle (0), l hexagone (1), les prolongements des cotes jusqu aux intersections et la droite de Pascal (2).
function pascalInter(P1, P2, P3, P4) { /* droite P1P2 contre droite P3P4, en fractions ; null si paralleles */
  const d1 = [feuSub(P2[0], P1[0]), feuSub(P2[1], P1[1])], d2 = [feuSub(P4[0], P3[0]), feuSub(P4[1], P3[1])], den = feuSub(feuMul(d1[0], d2[1]), feuMul(d1[1], d2[0]));
  if (den[0] === 0n) return null; const t = feuDiv(feuSub(feuMul(feuSub(P3[0], P1[0]), d2[1]), feuMul(feuSub(P3[1], P1[1]), d2[0])), den);
  return [feuAdd(P1[0], feuMul(t, d1[0])), feuAdd(P1[1], feuMul(t, d1[1]))]; }
function pascalTrois(H) { const X = pascalInter(H[0], H[1], H[3], H[4]), Y = pascalInter(H[1], H[2], H[4], H[5]), Z = pascalInter(H[2], H[3], H[5], H[0]); return X && Y && Z ? [X, Y, Z] : null; }
function pascalHexagramme(P, n) {
  const rng = mulberry32(P.graine); let H = null, I = null;
  for (let essai = 0; essai < 200 && !I; essai++) { const ts = new Set(); while (ts.size < 6) ts.add(Math.floor(rng() * 19) - 9);
    H = [...ts].map((t) => { const T = BigInt(t), d = 1n + T * T; return [feuF(1n - T * T, d), feuF(2n * T, d)]; });
    H.sort((u, v) => atan2D(feuNb(u[1]), feuNb(u[0])) - atan2D(feuNb(v[1]), feuNb(v[0]))); if (P.croise) H = [H[0], H[2], H[4], H[1], H[3], H[5]]; I = pascalTrois(H); }
  const aire = simsonAire2(I), H2 = [...H.slice(0, 5), [feuE(2), feuE(2)]], I2 = pascalTrois(H2), aireT = I2 ? simsonAire2(I2) : null;
  const nb = (q) => [feuNb(q[0]), feuNb(q[1])], Hn = H.map(nb), In = I.map(nb), segs = [];
  for (let k = 0; k < 6; k++) segs.push([Hn[k], Hn[(k + 1) % 6], 1]);
  const ext = [[0, 1, 0], [3, 4, 0], [1, 2, 1], [4, 5, 1], [2, 3, 2], [5, 0, 2]]; for (const [a, b, x] of ext) segs.push([Hn[a], In[x], 2], [Hn[b], In[x], 2]);
  let i0 = 0, i1 = 1, dm = -1; for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const dv = (In[i][0] - In[j][0]) ** 2 + (In[i][1] - In[j][1]) ** 2; if (dv > dm) { dm = dv; i0 = i; i1 = j; } } segs.push([In[i0], In[i1], 2]);
  const brut = new Float64Array(n * 3), nc = Math.floor(n / 4);
  for (let l = 0; l < n; l++) { const o = 3 * l; if (l < nc) { const a = 2 * PI * l / nc; brut[o] = cosD(a); brut[o + 1] = sinD(a); brut[o + 2] = 0; continue; }
    const t = (l - nc) * segs.length / (n - nc), j = Math.floor(t), u = t - j, sg = segs[j]; brut[o] = sg[0][0] + u * (sg[1][0] - sg[0][0]); brut[o + 1] = sg[0][1] + u * (sg[1][1] - sg[0][1]); brut[o + 2] = sg[2]; }
  return { D: 3, brut, nuage: true, unite: 'rayon du cercle = 1', invariants: {
    pascal: { mesure: feuNb(aire), formule: 0, exact: feuTexte(aire), hexagone: H.map((q) => '(' + feuTexte(q[0]) + ', ' + feuTexte(q[1]) + ')').join(' '), note: 'twice the signed area of the three meeting points of opposite sides, exact (0 = on one line)' },
    temoin: { mesure: aireT === null ? NaN : feuNb(aireT), exact: aireT === null ? null : feuTexte(aireT), absente: 'two opposite sides parallel', note: 'witness: F moved to (2, 2), off the circle : the three points are no longer on one line' } } };
}

// ---------- 38 : le theoreme de Ptolemee (idee et valeurs : codex Grok Bot ; MathWorld, Wikipedia « Ptolemy s theorem », lus par Grok) ----------
// Pour un quadrilatere ABCD inscrit dans un cercle : AC.BD = AB.CD + AD.BC (produit des diagonales = somme des produits des cotes opposes).
// Exact ici : quatre points RATIONNELS du cercle unite (parametrage t, graine), pris dans l ordre du cercle ; les longueurs sont des racines,
//   mais leurs CARRES sont des fractions : l egalite, elevee deux fois au carre, devient (AC2 BD2 - AB2 CD2 - AD2 BC2)^2 = 4 AB2 CD2 AD2 BC2,
//   verifiee en fractions BigInt A L IDENTIQUE (avec le signe AC2 BD2 - AB2 CD2 - AD2 BC2 >= 0, qui exclut la racine parasite).
// Aussi : les memes points dans l ordre CROISE A, C, B, D satisfont l identite elevee au carre, mais avec le mauvais signe : refuse (le signe sert).
// Temoin : C deplace hors du cercle (C x 6/5) : AB.CD + AD.BC > AC.BD strictement (inegalite de Ptolemee).
// Dessin (vue de face) : le cercle (0), le quadrilatere (1), les deux diagonales (2).
function ptolemee(P, n) {
  const rng = mulberry32(P.graine), ts = new Set(); while (ts.size < 4) ts.add(Math.floor(rng() * 25) - 12);
  const Q = [...ts].map((t) => { const tb = BigInt(t), den = 1n + tb * tb; return [feuF(1n - tb * tb, den), feuF(2n * tb, den)]; });
  Q.sort((u, v) => atan2D(feuNb(u[1]), feuNb(u[0])) - atan2D(feuNb(v[1]), feuNb(v[0])));
  const d2 = (U, V) => feuAdd(feuMul(feuSub(U[0], V[0]), feuSub(U[0], V[0])), feuMul(feuSub(U[1], V[1]), feuSub(U[1], V[1])));
  const verif = (A, B, C, Dd) => { const ab = d2(A, B), bc = d2(B, C), cd = d2(C, Dd), da = d2(Dd, A), ac = d2(A, C), bd = d2(B, Dd);
    const g = feuSub(feuSub(feuMul(ac, bd), feuMul(ab, cd)), feuMul(da, bc)), droite = feuMul(feuE(4), feuMul(feuMul(ab, cd), feuMul(da, bc)));
    return { egal: g[0] >= 0n && feuEq(feuMul(g, g), droite), ecart: Math.sqrt(feuNb(ab) * feuNb(cd)) + Math.sqrt(feuNb(da) * feuNb(bc)) - Math.sqrt(feuNb(ac) * feuNb(bd)) }; };
  const V = verif(...Q), X = verif(Q[0], Q[2], Q[1], Q[3]), C2 = [feuMul(feuF(6n, 5n), Q[2][0]), feuMul(feuF(6n, 5n), Q[2][1])], W = verif(Q[0], Q[1], C2, Q[3]);
  const nb = (q) => [feuNb(q[0]), feuNb(q[1])], Qn = Q.map(nb), segs = [];
  for (let k = 0; k < 4; k++) segs.push([Qn[k], Qn[(k + 1) % 4], 1]); segs.push([Qn[0], Qn[2], 2], [Qn[1], Qn[3], 2]);
  const brut = new Float64Array(n * 3), nc = Math.floor(n / 3);
  for (let l = 0; l < n; l++) { const o = 3 * l; if (l < nc) { const a = 2 * PI * l / nc; brut[o] = cosD(a); brut[o + 1] = sinD(a); brut[o + 2] = 0; continue; }
    const t = (l - nc) * segs.length / (n - nc), j = Math.floor(t), u = t - j, sg = segs[j]; brut[o] = sg[0][0] + u * (sg[1][0] - sg[0][0]); brut[o + 1] = sg[0][1] + u * (sg[1][1] - sg[0][1]); brut[o + 2] = sg[2]; }
  return { D: 3, brut, nuage: true, unite: 'rayon du cercle = 1', invariants: {
    ptolemee: { mesure: V.egal ? 0 : 1, formule: 0, ecartFlottant: V.ecart, quadrilatere: Q.map((q) => '(' + feuTexte(q[0]) + ', ' + feuTexte(q[1]) + ')').join(' '), note: 'AC.BD = AB.CD + AD.BC checked exactly on the squared lengths (0 = equal) ; ecartFlottant = the same in floating point' },
    croise: { mesure: X.egal ? 1 : 0, formule: 0, note: 'the same four points in CROSSED order A, C, B, D : the squared identity still holds but with the wrong sign (the parasitic root) — must be refused (0)' },
    temoin: { mesure: W.ecart, note: 'witness: C moved off the circle (x 6/5) : AB.CD + AD.BC - AC.BD, now strictly positive (Ptolemy s inequality)' } } };
}

// ---------- 39 : sommes de carres, Jacobi (4 carres) et 2 carres (idee et valeurs : codex Grok Bot ; MathWorld « Sum of Squares Function », Wikipedia « Jacobi s four-square theorem », lus par Grok) ----------
// r4(n) = nombre d ecritures n = a^2 + b^2 + c^2 + d^2 (entiers de signe quelconque, l ordre compte) = 8 x (somme des diviseurs d de n que 4 ne divise pas).
// r2(n) = nombre d ecritures n = a^2 + b^2 = 4 x (diviseurs = 1 mod 4 moins diviseurs = 3 mod 4).
// Exact ici : r4 et r2 COMPTES par enumeration de tous les (a, b, c, d) pour chaque m de 1 a n, compares aux deux formules par diviseurs.
// Temoin : sans la restriction « 4 ne divise pas d », 8 x sigma(n) se trompe des n = 4 (56 contre 24).
// Dessin (vue de face) : tous les points entiers (a, b) avec a^2 + b^2 <= n, etiquette = a^2 + b^2 (les cercles de rayon racine de m).
function sommesCarres(P, n) {
  const N = P.entier, R = Math.floor(Math.sqrt(N)), r4 = new Array(N + 1).fill(0), r2 = new Array(N + 1).fill(0);
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) { const s2 = a * a + b * b; if (s2 > N) continue; r2[s2]++;
    for (let c = -R; c <= R; c++) { const s3 = s2 + c * c; if (s3 > N) continue; for (let d = -R; d <= R; d++) { const s4 = s3 + d * d; if (s4 <= N) r4[s4]++; } } }
  let e4 = 0, e2 = 0, premier = null;
  for (let m = 1; m <= N; m++) { let j = 0, s = 0, d1 = 0, d3 = 0; for (let d = 1; d <= m; d++) if (m % d === 0) { s += d; if (d % 4) j += d; if (d % 4 === 1) d1++; if (d % 4 === 3) d3++; }
    if (r4[m] !== 8 * j) e4++; if (r2[m] !== 4 * (d1 - d3)) e2++; if (premier === null && r4[m] !== 8 * s) premier = m; }
  const pts = []; for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) if (a * a + b * b <= N) pts.push([a, b, a * a + b * b]);
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const pc = pts[Math.floor(l * pts.length / n)], o = 3 * l; brut[o] = pc[0]; brut[o + 1] = pc[1]; brut[o + 2] = pc[2]; }
  return { D: 3, brut, nuage: true, unite: 'points entiers', invariants: {
    jacobiQuatre: { mesure: e4, formule: 0, r4n: r4[N], note: 'values m = 1..n where r4(m) counted one by one differs from 8 x (sum of the divisors of m not divisible by 4)' },
    deuxCarres: { mesure: e2, formule: 0, r2n: r2[N], note: 'values m = 1..n where r2(m) counted one by one differs from 4 x (divisors = 1 mod 4 minus divisors = 3 mod 4)' },
    temoin: { mesure: premier === null ? NaN : premier, formule: 4, absente: 'n below 4', note: 'witness: without « 4 does not divide d », 8 x sigma(m) is wrong from m = 4 (56 instead of 24)' } } };
}

// ---------- 40 : l equation de Pell x^2 - D y^2 = 1 (idee et valeurs : codex Grok Bot ; MathWorld « Pell Equation », Wikipedia, lus par Grok) ----------
// Pour D entier non carre, la plus petite solution (x1, y1) avec y > 0 se lit dans la fraction continue de racine de D (les reduites p/q).
// Exact ici : fraction continue de racine de D en ENTIERS (m, d, a : aucune racine flottante au-dela de a0), reduites en BigInt jusqu a la
//   premiere qui verifie p^2 - D q^2 = 1, verifie a l identique ; minimalite par recherche exhaustive y = 1 .. y1 - 1 quand y1 <= 100 000.
//   Valeurs de Grok : D = 13 -> (649, 180), D = 19 -> (170, 39), D = 61 -> (1766319049, 226153980).
// Temoin : x^2 - 3 y^2 = -1 n a aucune solution (periode paire : les reduites ne donnent que +1 et -2) ; D = 2 en a une, (1, 1).
// Dessin (vue de face) : les reduites (k, p_k / q_k) qui encadrent racine de D, etiquette = signe de p^2 - D q^2 (0 negatif, 1 positif), et la droite racine de D (2).
function pellFondamentale(Dd) { const a0 = BigInt(Math.floor(Math.sqrt(Dd))); let a = a0; while ((a + 1n) * (a + 1n) <= BigInt(Dd)) a++; while (a * a > BigInt(Dd)) a--;
  const A0 = a, red = []; let m = 0n, d = 1n, p0 = 1n, p1 = A0, q0 = 0n, q1 = 1n, periode = 0; red.push([p1, q1]);
  for (let k = 0; k < 400; k++) { if (p1 * p1 - BigInt(Dd) * q1 * q1 === 1n) return { x: p1, y: q1, red, periode }; m = d * a - m; d = (BigInt(Dd) - m * m) / d; a = (A0 + m) / d; if (a === 2n * A0 && !periode) periode = k + 1;
    [p0, p1] = [p1, a * p1 + p0]; [q0, q1] = [q1, a * q1 + q0]; red.push([p1, q1]); }
  return null; }
function equationPell(P, n) {
  let Dd = P.radical; while (Number.isInteger(Math.sqrt(Dd))) Dd++;
  const S = pellFondamentale(Dd), reste = S.x * S.x - BigInt(Dd) * S.y * S.y - 1n;
  let plusPetite = null; if (S.y <= 100000n) for (let y = 1n; y < S.y && plusPetite === null; y++) { const x2 = 1n + BigInt(Dd) * y * y, x = BigInt(Math.round(Math.sqrt(Number(x2)))); for (const c of [x - 1n, x, x + 1n]) if (c * c === x2) plusPetite = y; }
  let moins3 = 0; for (let y = 1n; y <= 2000n; y++) { const x2 = 3n * y * y - 1n, x = BigInt(Math.round(Math.sqrt(Number(x2)))); for (const c of [x - 1n, x, x + 1n]) if (c >= 0n && c * c === x2) moins3++; }
  const rac = Math.sqrt(Dd), pts = S.red.map(([p, q], k) => [k, Number(p) / Number(q), p * p - BigInt(Dd) * q * q > 0n ? 1 : 0]), K = pts.length;
  const brut = new Float64Array(n * 3), nl = Math.floor(n / 4);
  for (let l = 0; l < n; l++) { const o = 3 * l; if (l < nl) { brut[o] = (K - 1) * l / nl; brut[o + 1] = rac; brut[o + 2] = 2; continue; } const pr = pts[Math.floor((l - nl) * K / (n - nl))]; brut[o] = pr[0]; brut[o + 1] = pr[1]; brut[o + 2] = pr[2]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    pell: { mesure: Number(reste), formule: 0, x1: String(S.x), y1: String(S.y), dUtilise: Dd, note: 'x1^2 - D y1^2 - 1 for the solution read from the continued fraction of root D, exact in BigInt' },
    minimale: { mesure: S.y <= 100000n ? (plusPetite === null ? 0 : 1) : NaN, formule: 0, absente: 'y1 above 100 000 : the exhaustive search is not run', note: 'a smaller y > 0 with 1 + D y^2 a perfect square (exhaustive search ; 0 = none, so the solution is the fundamental one)' },
    temoin: { mesure: moins3, formule: 0, note: 'witness: x^2 - 3 y^2 = -1 has no solution for y = 1 .. 2000 (and none at all : odd-period rule), while x^2 - 2 y^2 = -1 has (1, 1)' } } };
}

// ---------- 41 : les nombres de Carmichael (idee et valeurs : codex Grok Bot ; MathWorld « Carmichael Number », « Pseudoprime », OEIS A002997 / A001567, lus par Grok) ----------
// Le petit theoreme de Fermat (a^(n-1) = 1 mod n pour un n premier) a des menteurs : des nombres COMPOSES qui le verifient.
//   Pseudo-premier en base 2 : compose avec 2^(n-1) = 1 mod n (341 = 11 x 31 est le premier). Carmichael : compose qui le verifie pour TOUTE
//   base a premiere avec n — critere de Korselt : sans facteur carre, et p - 1 divise n - 1 pour chaque premier p qui divise n.
// Exact ici : Carmichael par Korselt jusqu au curseur ; pseudo-premiers base 2 par exponentiation modulaire ; chaque Carmichael impair est aussi
//   pseudo-premier base 2 (verifie). Valeurs de Grok : < 10 000 -> 561, 1105, 1729, 2465, 2821, 6601, 8911 ; base 2 < 2000 -> 341, 561, 645, 1105, 1387, 1729, 1905.
// Temoin : 341 trompe la base 2 mais pas la base 3 (3^340 mod 341 n est pas 1) : un pseudo-premier n est pas forcement un Carmichael.
// Dessin (vue de face) : pour chaque nombre trouve (par rang), ses facteurs premiers (rang, p), etiquette 0 = pseudo-premier base 2 seulement, 1 = Carmichael.
function carPuiss(a, e, m) { let r = 1, b = a % m; while (e > 0) { if (e & 1) r = (r * b) % m; b = (b * b) % m; e = Math.floor(e / 2); } return r; }
function carFacteurs(n) { const f = []; let m = n; for (let p = 2; p * p <= m; p++) while (m % p === 0) { f.push(p); m /= p; } if (m > 1) f.push(m); return f; }
function nombresCarmichael(P, n) {
  const N = P.limite, carm = [], psp2 = [];
  for (let k = 3; k <= N; k++) { const f = carFacteurs(k); if (f.length < 2) continue;
    const sansCarre = new Set(f).size === f.length; if (sansCarre && f.every((p) => (k - 1) % (p - 1) === 0)) carm.push(k);
    if (k % 2 === 1 && carPuiss(2, k - 1, k) === 1) psp2.push(k); }
  const pspSet = new Set(psp2), horsInclusion = carm.filter((c) => !pspSet.has(c)).length;
  const temoin = carPuiss(3, 340, 341);
  const pts = []; [...new Set([...psp2, ...carm])].sort((a, b) => a - b).forEach((k, rang) => { for (const p of carFacteurs(k)) pts.push([rang + 1, p, carm.includes(k) ? 1 : 0]); });
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const cf = pts[Math.floor(l * pts.length / n)], o = 3 * l; brut[o] = cf[0]; brut[o + 1] = cf[1]; brut[o + 2] = cf[2]; }
  return { D: 3, brut, nuage: true, unite: 'entiers', invariants: {
    carmichael: { mesure: carm.length, liste: carm.slice(0, 20).join(', '), formule: N >= 8911 && N < 10585 ? 7 : null, note: 'Carmichael numbers up to the slider (Korselt : squarefree, p - 1 divides n - 1 for every prime p of n)' },
    pseudo: { mesure: psp2.length, liste: psp2.slice(0, 20).join(', '), note: 'odd composites n up to the slider with 2^(n-1) = 1 mod n (base-2 pseudoprimes)' },
    inclusion: { mesure: horsInclusion, formule: 0, note: 'Carmichael numbers that are NOT base-2 pseudoprimes (0 : every Carmichael number fools base 2)' },
    temoin: { mesure: temoin, note: 'witness: 3^340 mod 341 (not 1 : 341 fools base 2, not base 3)' } } };
}

// ---------- 42 : le theoreme de Wilson (idee et valeurs : codex Grok Bot ; MathWorld « Wilson s Theorem », lu par Grok) ----------
// n > 1 est premier si et seulement si (n - 1)! = -1 mod n, c est-a-dire (n - 1)! mod n = n - 1. Pour un compose : 2 si n = 4, 0 au-dela.
// Exact ici : (n - 1)! mod n par produits modulaires (entiers exacts) pour chaque n de 2 au curseur, compare a la primalite par division d essai ;
//   valeurs de Grok n = 2..30 : 1, 2, 2, 4, 0, 6, 0, 0, 0, 10, 0, 12, 0, 0, 0, 16, 0, 18, 0, 0, 0, 22, 0, 0, 0, 0, 0, 28, 0.
// Temoin : n = 4, compose, ou (n - 1)! mod n vaut 2 et non 0 : la regle « compose -> 0 » a UNE exception.
// Dessin (vue de face) : les points (n / limite, ((n - 1)! mod n) / n) (deux colonnes de meme taille), etiquette 1 = premier (pres de 1), 0 = compose.
function wilsonReste(k) { let r = 1; for (let i = 2; i < k; i++) r = (r * i) % k; return r % k; }
function theoremeWilson(P, n) {
  const N = P.limite, restes = [0, 0]; let ecarts = 0, regle = 0;
  for (let k = 2; k <= N; k++) { const r = wilsonReste(k); restes.push(r); let premier = true; for (let d = 2; d * d <= k; d++) if (k % d === 0) { premier = false; break; }
    if ((r === k - 1) !== premier) ecarts++; if (!premier && r !== (k === 4 ? 2 : 0)) regle++; }
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const k = 2 + Math.floor(l * (N - 1) / n), o = 3 * l, r = restes[k]; brut[o] = k / N; brut[o + 1] = r / k; brut[o + 2] = r === k - 1 ? 1 : 0; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    wilson: { mesure: ecarts, formule: 0, trente: restes.slice(2, 31).join(', '), note: 'n from 2 to the slider where « (n - 1)! mod n = n - 1 » and « n is prime » (trial division) disagree' },
    composes: { mesure: regle, formule: 0, note: 'composite n where (n - 1)! mod n is not 2 (n = 4) or 0 (n > 4)' },
    temoin: { mesure: restes[4], formule: 2, note: 'witness: n = 4, composite, gives 3! mod 4 = 2, not 0 : the one exception' } } };
}

// ---------- 43 : la fonction de Mertens M(n) (idee et valeurs : codex Grok Bot ; MathWorld « Mertens Function », OEIS A002321, lus par Grok) ----------
// mu(k) = 0 si k a un facteur carre, sinon (-1)^(nombre de facteurs premiers) ; M(n) = mu(1) + ... + mu(n), une marche qui monte et descend.
// Exact ici : mu par un crible, M par somme d entiers ; et l identite derivee de l inversion de Mobius : somme_{k <= n} M(n div k) = 1, verifiee
//   pour CHAQUE n jusqu au curseur. M(1..50) = valeurs de Grok (M(7) = -2).
// Temoin : avec la fonction de Liouville lambda(k) = (-1)^(nombre de facteurs premiers, avec multiplicite) au lieu de mu, la meme somme vaut
//   partie entiere de racine de n (derive : la somme de lambda sur les diviseurs de m vaut 1 si m est un carre, 0 sinon) — pas 1.
// Dessin (vue de face) : la marche (n / limite, M(n) / racine de la limite), etiquette = mu(n) + 1 (0, 1 ou 2).
function mertensCribles(N) { const mu = new Int8Array(N + 1).fill(1), lam = new Int8Array(N + 1).fill(1), est = new Uint8Array(N + 1);
  for (let p = 2; p <= N; p++) if (!est[p]) { for (let m = p; m <= N; m += p) { est[m] = m !== p ? 1 : est[m]; mu[m] = -mu[m]; } for (let j = p * p; j <= N; j += p * p) mu[j] = 0;
    for (let q = p; q <= N; q *= p) for (let m = q; m <= N; m += q) lam[m] = -lam[m]; }
  return { mu, lam }; }
function fonctionMertens(P, n) {
  const N = P.limite, { mu, lam } = mertensCribles(N), M = new Int32Array(N + 1), L = new Int32Array(N + 1);
  for (let k = 1; k <= N; k++) { M[k] = M[k - 1] + mu[k]; L[k] = L[k - 1] + lam[k]; }
  let horsIdentite = 0; for (let m = 1; m <= N; m++) { let s = 0; for (let k = 1; k <= m; k++) s += M[Math.floor(m / k)]; if (s !== 1) horsIdentite++; }
  let sL = 0; for (let k = 1; k <= N; k++) sL += L[Math.floor(N / k)];
  const rac = Math.sqrt(N), brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const k = 1 + Math.floor(l * N / n), o = 3 * l; brut[o] = k / N; brut[o + 1] = M[k] / rac; brut[o + 2] = mu[k] + 1; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    identiteMobius: { mesure: horsIdentite, formule: 0, mn: M[N], cinquante: Array.from(M.slice(1, 51)).join(', '), note: 'n up to the slider where the sum over k of M(n div k) is not 1 (Mobius inversion)' },
    temoin: { mesure: sL, formule: Math.floor(Math.sqrt(N)), note: 'witness: the same sum with Liouville lambda instead of mu gives floor(sqrt n), not 1' } } };
}

// ---------- 44 : nombres parfaits et amicaux (idee et valeurs : codex Grok Bot ; MathWorld « Perfect Number », « Amicable Pair », OEIS A000396 / A063990, lus par Grok) ----------
// s(n) = somme des diviseurs de n autres que n. Parfait : s(n) = n (6, 28, 496, 8128). Amicaux : s(m) = n et s(n) = m, m different de n (220 et 284).
// Exact ici : s(n) par un crible des diviseurs (entiers) jusqu au curseur ; parfaits et paires amicales listes ; chaque parfait PAIR trouve est de la
//   forme 2^(p-1) (2^p - 1) avec 2^p - 1 premier (Euclide-Euler, verifie). L existence d un parfait IMPAIR est une question ouverte : non affirmee.
//   Valeurs de Grok : parfaits 6, 28, 496, 8128 ; paires < 10 000 : (220, 284), (1184, 1210), (2620, 2924), (5020, 5564), (6232, 6368).
// Temoin : p = 11, 2^11 - 1 = 2047 = 23 x 89 n est pas premier : 2^10 x 2047 n est pas parfait (sigma = 4 421 520, pas 2N = 4 192 256).
// Dessin (vue de face) : (n / limite, s(n) / n), etiquette 2 = parfait, 1 = amical, 0 = autre.
function aliquoteCrible(N) { const s = new Int32Array(N + 1); for (let d = 1; d <= N / 2; d++) for (let m = 2 * d; m <= N; m += d) s[m] += d; return s; }
function parfaitsAmicaux(P, n) {
  const N = P.limite, s = aliquoteCrible(N), parfaits = [], paires = [];
  for (let k = 2; k <= N; k++) { if (s[k] === k) parfaits.push(k); const t = s[k]; if (t > k && t <= N && s[t] === k) paires.push([k, t]); }
  /* forme d Euclide : q = 2^(p-1) m avec m = 2^p - 1 PREMIER ; appliquee aux parfaits pairs ET au temoin (qui doit etre refuse) */
  const euclideOk = (q) => { let a = 0, m = q; while (m % 2 === 0) { m /= 2; a++; } const p = a + 1; let prem = m > 1; for (let d = 2; d * d <= m; d++) if (m % d === 0) prem = false; return m === 2 ** p - 1 && prem; };
  let horsEuler = 0; for (const q of parfaits) if (q % 2 === 0 && !euclideOk(q)) horsEuler++;
  const sigma = (2 ** 11 - 1) * (23 + 1) * (89 + 1), deuxN = 2 * 2 ** 10 * 2047;
  /* la moitie des points sur les nombres remarquables (parfaits, amicaux), l autre moitie sur tous les n */
  const amic = new Set(paires.flat()), rem = [...parfaits, ...amic], brut = new Float64Array(n * 3), mi = Math.floor(n / 2);
  for (let l = 0; l < n; l++) { const k = l < mi && rem.length ? rem[l % rem.length] : 2 + Math.floor((l - mi) * (N - 1) / (n - mi)), o = 3 * l; brut[o] = k / N; brut[o + 1] = s[k] / k; brut[o + 2] = s[k] === k ? 2 : amic.has(k) ? 1 : 0; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    parfaits: { mesure: parfaits.length, liste: parfaits.join(', '), note: 'perfect numbers up to the slider (s(n) = n)' },
    amicaux: { mesure: paires.length, liste: paires.map(([a, b]) => a + '/' + b).join(', '), note: 'amicable pairs with both members up to the slider' },
    euclideEuler: { mesure: horsEuler, formule: 0, note: 'even perfect numbers found that are NOT 2^(p-1)(2^p - 1) with 2^p - 1 prime' },
    temoin: { mesure: sigma - deuxN, formeAcceptee: euclideOk(2 ** 10 * 2047) ? 1 : 0, note: 'witness: sigma(2^10 x 2047) - 2 x (2^10 x 2047), with 2047 = 23 x 89 not prime : not 0, not perfect' } } };
}

// ---------- 45 : les nombres de Bernoulli (idee et valeurs : codex Grok Bot ; MathWorld « Bernoulli Number », OEIS A027641 / A027642, lus par Grok) ----------
// B_0 = 1 et B_m = -1/(m + 1) somme_{k < m} binom(m + 1, k) B_k (convention B_1 = -1/2) : 1, -1/2, 1/6, 0, -1/30, 0, 1/42, ..., B_12 = -691/2730.
// Exact ici, en fractions BigInt, jusqu au rang du curseur ; et deux verifications INDEPENDANTES de la recurrence :
//   Faulhaber : 0^p + 1^p + ... + (m - 1)^p = 1/(p + 1) somme_j binom(p + 1, j) B_j m^(p + 1 - j), pour p <= 20 et m = 1..12, a l identique ;
//   von Staudt-Clausen : B_2k + somme des 1/q pour les premiers q avec (q - 1) qui divise 2k est un ENTIER.
// Et les B impairs au-dela de B_1 sont nuls. Valeurs de Grok : B_0 .. B_12.
// Temoin : avec l ancienne convention B_1 = +1/2, la formule de Faulhaber pour 0 .. m - 1 se trompe (elle donne la somme de 1 a m).
// Dessin (vue de face) : (n, log10 |B_n|) pour les B non nuls, etiquette 1 si B_n > 0, 0 sinon.
function bernoulliSuite(N) { const B = [[1n, 1n]];
  for (let m = 1; m <= N; m++) { let s = [0n, 1n]; for (let k = 0; k < m; k++) s = feuAdd(s, feuMul(feuF(binomB(m + 1, k), 1n), B[k])); B.push(feuMul(s, feuF(-1n, BigInt(m + 1)))); }
  return B; }
function bernFaulhaber(B, p, m, b1) { /* somme exacte 0..m-1 de k^p contre la formule */
  let gauche = 0n; for (let k = 0n; k < BigInt(m); k++) gauche += k ** BigInt(p);
  let droite = [0n, 1n]; for (let j = 0; j <= p; j++) { const Bj = j === 1 ? b1 : B[j]; droite = feuAdd(droite, feuMul(feuF(binomB(p + 1, j) * BigInt(m) ** BigInt(p + 1 - j), 1n), Bj)); }
  droite = feuMul(droite, feuF(1n, BigInt(p + 1))); return feuEq(droite, [gauche, 1n]); }
function nombresBernoulli(P, n) {
  const N = P.rangB, B = bernoulliSuite(N); let fauxF = 0, fauxF2 = 0, fauxS = 0, impairs = 0;
  for (let p = 0; p <= Math.min(N, 20); p++) for (let m = 1; m <= 12; m++) { if (!bernFaulhaber(B, p, m, B[1])) fauxF++; if (!bernFaulhaber(B, p, m, [1n, 2n])) fauxF2++; }
  for (let k = 3; k <= N; k += 2) if (B[k][0] !== 0n) impairs++;
  for (let k = 2; k <= N; k += 2) { let s = B[k]; for (let q = 2; q <= k + 1; q++) { let prem = true; for (let d = 2; d * d <= q; d++) if (q % d === 0) prem = false; if (prem && k % (q - 1) === 0) s = feuAdd(s, feuF(1n, BigInt(q))); } if (s[1] !== 1n) fauxS++; }
  const pts = []; for (let k = 0; k <= N; k++) if (B[k][0] !== 0n) { const v = Math.abs(feuNb(B[k])); pts.push([k, lnD(v) / lnD(10), B[k][0] > 0n ? 1 : 0]); }
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const bp = pts[Math.floor(l * pts.length / n)], o = 3 * l; brut[o] = bp[0]; brut[o + 1] = bp[1]; brut[o + 2] = bp[2]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    faulhaber: { mesure: fauxF, formule: 0, b12: feuTexte(B[Math.min(12, N)]), note: 'pairs (p <= 20, m <= 12) where the sum 0^p + ... + (m - 1)^p differs from Faulhaber s formula with these B (exact)' },
    vonStaudt: { mesure: fauxS, formule: 0, note: 'even indices 2k where B_2k + sum of 1/q over primes q with (q - 1) | 2k is not a whole number (von Staudt-Clausen)' },
    impairsNuls: { mesure: impairs, formule: 0, note: 'odd indices above 1 where B is not 0' },
    temoin: { mesure: fauxF2, note: 'witness: with the old convention B_1 = +1/2, Faulhaber s formula for 0 .. m - 1 fails this many times (it gives 1 .. m)' } } };
}

// ---------- 46 : le probleme de Josephus (idee et valeurs : codex Grok Bot ; MathWorld, Wikipedia « Josephus problem », OEIS A006257, lus par Grok) ----------
// n personnes en cercle, numerotees 1..n ; on elimine une personne sur k en tournant. Qui reste ?
// Exact ici : le cercle est SIMULE (tableau, eliminations reelles) pour chaque taille m <= n, et le survivant compare a la recurrence
//   J(1) = 1, J(m) = ((J(m - 1) + k - 1) mod m) + 1 ; pour k = 2, aussi a la formule J(m) = 2L + 1 (m = 2^a + L, 0 <= L < 2^a).
//   Valeurs de Grok : J(1..20, 2) = 1, 1, 3, 1, 3, 5, 7, 1, ... ; J(1..15, 3) = 1, 2, 2, 1, 4, 1, 4, 7, 1, 4, 7, 10, 13, 2, 5.
// Temoin : la formule 2L + 1 de k = 2 appliquee a k = 3 se trompe des n = 2.
// Dessin (vue de face) : les n personnes en cercle, etiquette = l ordre d elimination (le survivant, dernier, a la plus grande).
function josephusSimule(m, k) { const cercle = Array.from({ length: m }, (_, i) => i + 1), ordre = new Array(m + 1).fill(0); let i = 0, rang = 0;
  while (cercle.length > 1) { i = (i + k - 1) % cercle.length; ordre[cercle[i]] = ++rang; cercle.splice(i, 1); } ordre[cercle[0]] = m; return { survivant: cercle[0], ordre }; }
function problemeJosephus(P, n) {
  const N = P.personnes, K = P.pasK; let J = 1, ecartsRec = 0, ecarts2L = 0, premier3 = null;
  for (let m = 1; m <= N; m++) { if (m > 1) J = ((J + K - 1) % m) + 1; if (josephusSimule(m, K).survivant !== J) ecartsRec++;
    let a = 0; while (2 ** (a + 1) <= m) a++; const L = m - 2 ** a; if (K === 2 && 2 * L + 1 !== J) ecarts2L++; }
  let J3 = 1; for (let m = 2; m <= 40 && premier3 === null; m++) { J3 = ((J3 + 2) % m) + 1; let a = 0; while (2 ** (a + 1) <= m) a++; if (2 * (m - 2 ** a) + 1 !== J3) premier3 = m; }
  const S = josephusSimule(N, K), brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const q = 1 + Math.floor(l * N / n), a = 2 * PI * (q - 1) / N, o = 3 * l; brut[o] = cosD(a + PI / 2); brut[o + 1] = sinD(a + PI / 2); brut[o + 2] = S.ordre[q]; }
  return { D: 3, brut, nuage: true, unite: 'rayon 1', invariants: {
    josephus: { mesure: ecartsRec, formule: 0, survivant: S.survivant, note: 'circle sizes m <= n where the simulated survivor differs from the recurrence J(m) = ((J(m - 1) + k - 1) mod m) + 1' },
    formule2L: { mesure: K === 2 ? ecarts2L : NaN, formule: 0, absente: 'the 2L + 1 formula is for k = 2 only', note: 'k = 2 : sizes m where J(m) differs from 2L + 1 (m = 2^a + L)' },
    temoin: { mesure: premier3 === null ? NaN : premier3, formule: 2, note: 'witness: the k = 2 formula 2L + 1 applied to k = 3 is wrong from n = 2' } } };
}

// ---------- 47 : la representation de Zeckendorf (idee et valeurs : codex Grok Bot ; MathWorld « Zeckendorf Representation », OEIS A007895, lus par Grok) ----------
// Tout entier n >= 1 s ecrit d UNE SEULE facon comme somme de nombres de Fibonacci (1, 2, 3, 5, 8, ...) distincts et NON CONSECUTIFS.
// Exact ici : l ecriture gloutonne (le plus grand Fibonacci qui tient, a chaque pas) pour chaque n jusqu au curseur, verifiee non consecutive ;
//   l UNICITE verifiee (n <= 300) en comptant TOUTES les ecritures en Fibonacci distincts non consecutifs (programmation dynamique, entiers) : exactement 1.
//   Nombre de termes (Grok, A007895) : n = 1..30 -> 1, 1, 1, 2, 1, 2, 2, 1, 2, 2, 2, 3, 1, 2, 2, 2, 3, 2, 3, 3, 1, 2, 2, 2, 3, 2, 3, 3, 2, 3.
// Temoin : si l on autorise les Fibonacci CONSECUTIFS, l unicite tombe (3 = 3 = 2 + 1) : nombre de n <= 30 qui ont alors plusieurs ecritures.
// Dessin (vue de face) : chaque n (en ligne) et les Fibonacci de son ecriture (en colonne), etiquette = nombre de termes.
function zeckFib(N) { const F = [1, 2]; while (F[F.length - 1] + F[F.length - 2] <= N) F.push(F[F.length - 1] + F[F.length - 2]); return F; }
function zeckGlouton(m, F) { const idx = []; let r = m; for (let i = F.length - 1; i >= 0 && r > 0; i--) if (F[i] <= r) { idx.push(i); r -= F[i]; } return idx; }
function zeckCompte(m, F, consecutifs) { /* ecritures de m en Fibonacci distincts (indices croissants), non consecutifs sauf si autorise */
  const memo = new Map(); const go = (r, i, pris) => { if (r === 0) return 1; if (i >= F.length || F[i] > r) return 0; const cle = r + ',' + i + ',' + pris; if (memo.has(cle)) return memo.get(cle);
    let c = go(r, i + 1, 0); if (consecutifs || !pris) c += go(r - F[i], i + 1, 1); memo.set(cle, c); return c; };
  return go(m, 0, 0); }
function zeckendorf(P, n) {
  const N = P.entier, F = zeckFib(N); let consec = 0, nonUniques = 0; const termes = [0];
  for (let m = 1; m <= N; m++) { const idx = zeckGlouton(m, F); termes.push(idx.length); if (idx.some((v, j) => j > 0 && idx[j - 1] - v < 2)) consec++; if (m <= 300 && zeckCompte(m, F, false) !== 1) nonUniques++; }
  let temoin = 0; for (let m = 1; m <= 30; m++) if (zeckCompte(m, F, true) > 1) temoin++;
  const cases = []; const M = Math.min(N, 200); for (let m = 1; m <= M; m++) for (const i of zeckGlouton(m, F)) cases.push([i, m, termes[m]]);
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const z = cases[Math.floor(l * cases.length / n)], o = 3 * l; brut[o] = z[0]; brut[o + 1] = -z[1] * F.length / M; brut[o + 2] = z[2]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    unicite: { mesure: consec + nonUniques, formule: 0, termesZ: termes.slice(1, 31).join(', '), note: 'n up to the slider whose greedy writing uses two consecutive Fibonacci numbers, plus n <= 300 with a number of writings other than one' },
    temoin: { mesure: temoin, note: 'witness: n <= 30 that have several writings once consecutive Fibonacci numbers are allowed (3 = 3 = 2 + 1)' } } };
}

// ---------- 48 : le theoreme de Lucas (idee et valeurs : codex Grok Bot ; MathWorld « Lucas Correspondence Theorem », OEIS A083093, lus par Grok) ----------
// Pour p premier, binom(n, k) mod p = produit des binom(n_i, k_i) mod p, n_i et k_i les chiffres de n et k en base p.
// Exact ici : le triangle de Pascal construit ligne par ligne MODULO p (additions), compare case par case a la regle des chiffres, jusqu a la
//   ligne du curseur. Lignes 0..9 mod 3 de Grok (A083093) : ..., n = 8 -> 1, 2, 1, 2, 1, 2, 1, 2, 1 ; n = 9 -> 1, 0 ... 0, 1.
// Temoin : la meme regle des chiffres pour un module COMPOSE, 4 : binom(6, 2) = 15 = 3 mod 4, mais les chiffres en base 4 (12 et 02) donnent 1.
// Dessin (vue de face) : le triangle (k, -n), etiquette = binom(n, k) mod p (les motifs fractals du triangle).
function lucasRegle(n, k, p) { let r = 1; while (n > 0 || k > 0) { const a = n % p, b = k % p; if (b > a) return 0; let c = 1; for (let i = 0; i < b; i++) c = c * (a - i) / (i + 1); r = (r * c) % p; n = Math.floor(n / p); k = Math.floor(k / p); } return r; }
function theoremeLucas(P, n) {
  let p = P.baseP; const prem = (q) => { for (let d = 2; d * d <= q; d++) if (q % d === 0) return false; return q > 1; }; while (!prem(p)) p++;
  const N = P.lignesL; let ligne = [1], ecarts = 0; const cases = [];
  for (let m = 0; m <= N; m++) { for (let k = 0; k <= m; k++) { if (ligne[k] !== lucasRegle(m, k, p)) ecarts++; cases.push([k - m / 2, -m, ligne[k]]); }
    const suivante = [1]; for (let k = 1; k <= m; k++) suivante.push((ligne[k - 1] + ligne[k]) % p); suivante.push(1); ligne = suivante; }
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const lc = cases[Math.floor(l * cases.length / n)], o = 3 * l; brut[o] = lc[0]; brut[o + 1] = lc[1]; brut[o + 2] = lc[2]; }
  let r3 = []; { let L = [1]; for (let m = 0; m <= 9; m++) { r3.push(L.join('')); const S = [1]; for (let k = 1; k <= m; k++) S.push((L[k - 1] + L[k]) % 3); S.push(1); L = S; } }
  return { D: 3, brut, nuage: true, unite: 'cases du triangle', invariants: {
    lucas: { mesure: ecarts, formule: 0, pUtilise: p, mod3: r3.join(' '), note: 'cells of Pascal s triangle mod p (built by additions) that differ from the base-p digit rule, up to the slider row' },
    temoin: { mesure: lucasRegle(6, 2, 4), formule: 1, vrai: 15 % 4, note: 'witness: the digit rule with the composite modulus 4 gives binom(6, 2) = 1, the truth is 15 mod 4 = 3' } } };
}

// ---------- 49 : l arbre de Calkin-Wilf (idee et valeurs : codex Grok Bot ; MathWorld « Calkin-Wilf Tree », OEIS A002487, lus par Grok) ----------
// Racine 1/1 ; sous a/b, a gauche a/(a + b), a droite (a + b)/b. Lu en largeur, l arbre enumere CHAQUE rationnel positif exactement une fois.
// Exact ici (entiers) : l arbre construit en largeur sur D niveaux (2^D - 1 fractions) ; chaque fraction est irreductible ; aucune n apparait
//   deux fois ; toute fraction reduite p/q avec p + q <= D + 1 est presente (sa profondeur ne depasse pas p + q - 1) ; et la n-ieme fraction vaut
//   fusc(n) / fusc(n + 1) (suite de Stern : fusc(2n) = fusc(n), fusc(2n + 1) = fusc(n) + fusc(n + 1)). 30 premieres : valeurs de Grok.
// Temoin : l enumeration naive par diagonales de Cantor (1/1, 1/2, 2/1, 1/3, 2/2, 3/1, ...) repete des valeurs (2/2 = 1/1).
// Dessin (vue de face) : l arbre, (position dans le niveau, -niveau), etiquette 1 si la fraction est > 1, 0 sinon.
function calkinWilf(P, n) {
  const Dn = P.niveaux, total = 2 ** Dn - 1, fr = [[1, 1]];
  for (let i = 0; fr.length < total; i++) { const [a, b] = fr[i]; fr.push([a, a + b], [a + b, b]); }
  const g = (x, y) => { while (y) [x, y] = [y, x % y]; return x; };
  const fusc = [0, 1]; for (let k = 2; k <= total + 1; k++) fusc.push(k % 2 ? fusc[(k - 1) / 2] + fusc[(k + 1) / 2] : fusc[k / 2]);
  let nonReduites = 0, doublons = 0, horsStern = 0; const vues = new Set();
  fr.forEach(([a, b], i) => { if (g(a, b) !== 1) nonReduites++; const cle = a + '/' + b; if (vues.has(cle)) doublons++; vues.add(cle); if (a !== fusc[i + 1] || b !== fusc[i + 2]) horsStern++; });
  let manquantes = 0; for (let s = 2; s <= Dn + 1; s++) for (let p = 1; p < s; p++) if (g(p, s - p) === 1 && !vues.has(p + '/' + (s - p))) manquantes++;
  const cantor = new Set(); let repetes = 0, vus = 0; for (let s = 2; vus < 30; s++) for (let p = 1; p < s && vus < 30; p++) { const q = s - p, d = g(p, q), cle = (p / d) + '/' + (q / d); if (cantor.has(cle)) repetes++; cantor.add(cle); vus++; }
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const i = Math.floor(l * total / n); let d = 0; while (2 ** (d + 1) <= i + 1) d++;
    const o = 3 * l, [a, b] = fr[i]; brut[o] = (i + 1 - 2 ** d + 0.5) / 2 ** d; brut[o + 1] = -d / Dn; brut[o + 2] = a > b ? 1 : 0; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    calkinWilf: { mesure: nonReduites + doublons + horsStern, formule: 0, trente: fr.slice(0, 30).map(([a, b]) => a + '/' + b).join(' '), note: 'fractions in the first 2^D - 1 that are not reduced, appear twice, or differ from fusc(n)/fusc(n + 1)' },
    complet: { mesure: manquantes, formule: 0, note: 'reduced fractions p/q with p + q <= D + 1 missing from the first 2^D - 1 (every one must be there)' },
    temoin: { mesure: repetes, note: 'witness: the first 30 fractions of Cantor s diagonal listing repeat this many values (2/2 = 1/1, ...)' } } };
}

// ---------- 50 : les tours de Hanoi et le code de Gray (idee et valeurs : codex Grok Bot ; MathWorld « Tower of Hanoi », « Gray Code », OEIS A000225, lus par Grok) ----------
// Deplacer n disques d un piquet a un autre, un a la fois, jamais un grand sur un petit : il faut 2^n - 1 coups au minimum (T(n) = 2 T(n - 1) + 1).
// Exact ici : la solution recursive est JOUEE sur trois piles ; on compte les coups (2^n - 1), on verifie que chaque coup est legal, et que le disque
//   deplace au coup m est le disque 1 + (nombre de zeros a droite de m) — le bit qui change entre g(m - 1) et g(m) dans le code de Gray
//   g(m) = m xor (m div 2), qui ne change qu UN bit a chaque pas.
// Temoin : en binaire ordinaire, plusieurs bits changent d un coup sur deux (2^(n-1) - 1 fois sur 2^n - 1) : seul le code de Gray suit les disques.
// Dessin (vue de face) : (coup / total, disque / n), etiquette = piquet d arrivee (0, 1, 2).
function hanoiJouer(n) { const piles = [[], [], []], coups = []; for (let d = n; d >= 1; d--) piles[0].push(d); let illegaux = 0;
  const bouge = (k, de, vers, via) => { if (k === 0) return; bouge(k - 1, de, via, vers); const disque = piles[de].pop(), sommet = piles[vers][piles[vers].length - 1];
    if (disque !== k || (sommet !== undefined && sommet < disque)) illegaux++; piles[vers].push(disque); coups.push([disque, vers]); bouge(k - 1, via, vers, de); };
  bouge(n, 0, 2, 1); return { coups, illegaux, fini: piles[2].length === n }; }
function toursHanoi(P, n) {
  const N = P.disques, J = hanoiJouer(N); let horsGray = 0, binaireMulti = 0;
  J.coups.forEach(([disque], i) => { const m = i + 1; let z = 0, t = m; while (t % 2 === 0) { t /= 2; z++; } const x = (m ^ (m >> 1)) ^ ((m - 1) ^ ((m - 1) >> 1)); let bits = 0, y = x, pos = 0; while (y) { if (y & 1) { bits++; pos = pos || 0; } y >>= 1; }
    let p = 0; while (!((x >> p) & 1)) p++; if (disque !== z + 1 || bits !== 1 || p !== z) horsGray++; let c = 0, w = m ^ (m - 1); while (w) { c += w & 1; w >>= 1; } if (c > 1) binaireMulti++; });
  const total = J.coups.length, brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const i = Math.floor(l * total / n), o = 3 * l; brut[o] = (i + 1) / total; brut[o + 1] = J.coups[i][0] / N; brut[o + 2] = J.coups[i][1]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    hanoi: { mesure: total - (2 ** N - 1) + J.illegaux + (J.fini ? 0 : 1), formule: 0, coups: total, note: 'moves made minus 2^n - 1, plus illegal moves, plus 1 if the tower did not arrive' },
    gray: { mesure: horsGray, formule: 0, note: 'moves m where the disk moved is not 1 + (trailing zeros of m), or the Gray code changes more than one bit' },
    temoin: { mesure: binaireMulti, formule: 2 ** (N - 1) - 1, note: 'witness: steps where ordinary binary counting changes more than one bit (2^(n-1) - 1 of them)' } } };
}

// ---------- 51 : la suite « regarder et dire » (idee et valeurs : codex Grok Bot ; MathWorld « Look and Say Sequence », OEIS A005341, lus par Grok) ----------
// Partir de 1 et lire a voix haute : 1 -> « un 1 » = 11 -> « deux 1 » = 21 -> 1211 -> 111221 -> 312211 -> ...
// Exact ici : chaque terme construit par runs de chiffres egaux (chaines), jusqu au rang du curseur ; longueurs 1..15 = valeurs de Grok :
//   1, 2, 2, 4, 6, 6, 8, 10, 14, 20, 26, 34, 46, 62, 78. MESURE sur chaque terme (non demontre ici) : aucun chiffre au-dela de 3, jamais « 333 ».
//   (La constante de croissance de Conway n est pas affirmee ici.)
// Temoin : la graine 22 est un point fixe (« deux 2 » = 22) : sa suite ne grandit jamais.
// Dessin (vue de face) : pour chaque terme (rang / rangs, longueur relative en echelle log), etiquette = nombre de chiffres differents.
function lasSuivant(s) { const r = []; let i = 0; while (i < s.length) { let j = i; while (j < s.length && s[j] === s[i]) j++; r.push((j - i) + s[i]); i = j; } return r.join(''); }
function regarderDire(P, n) {
  const N = P.rangs, termes = ['1']; for (let k = 1; k < N; k++) termes.push(lasSuivant(termes[k - 1]));
  let horsChiffres = 0, triples = 0; termes.forEach((t) => { if (/[4-9]/.test(t)) horsChiffres++; if (t.includes('333')) triples++; });
  let g = '22'; for (let k = 0; k < 10; k++) g = lasSuivant(g);
  const maxL = termes[N - 1].length, brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const k = Math.floor(l * N / n), o = 3 * l; brut[o] = (k + 1) / N; brut[o + 1] = lnD(termes[k].length) / lnD(maxL); brut[o + 2] = new Set(termes[k]).size; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    regarderDire: { mesure: horsChiffres + triples, formule: 0, longueurs: termes.slice(0, 15).map((t) => t.length).join(', '), septieme: termes[Math.min(6, N - 1)], note: 'terms (up to the slider) with a digit above 3 or the block 333 — measured on every term' },
    temoin: { mesure: g, formule: '22', note: 'witness: seed 22 read ten times stays 22 (a fixed point, it never grows)' } } };
}

// ---------- 52 : les derangements (idee et valeurs : codex Grok Bot ; MathWorld « Derangement », OEIS A000166, lus par Grok) ----------
// Un derangement est une permutation sans point fixe (personne ne recupere son propre chapeau). D(n) = n! somme (-1)^k / k!.
// Exact ici : toutes les permutations de n <= 8 objets ENUMEREES (algorithme de Heap) et celles sans point fixe comptees ; pour m <= 30,
//   D(m) par inclusion-exclusion EN ENTIERS (somme des (-1)^k m!/k!, BigInt) = recurrence D(m) = (m - 1)(D(m - 1) + D(m - 2)) ;
//   et D(m) = l entier le plus proche de m!/e pour 1 <= m <= 30, PROUVE en entiers : e encadre par A/K! et (A K + 1)/(K! K), A = somme des K!/k!, K = 30
//   (un flottant ne suffit pas : expPosD(1) decale 18!/e de 0.4 et l arrondi bascule). D(0..12) : valeurs de Grok (A000166).
// Temoin : m = 0, D(0) = 1, mais l entier le plus proche de 0!/e = 0.368 est 0 : la regle de l arrondi commence a 1.
// Dessin (vue de face) : un derangement tire (graine) parmi tous ceux de n objets, points (i, sigma(i)) ; etiquette = deplacement sigma(i) - i (jamais 0 ; un decalage constant c deborde apres n - 1 et revient a c - n : au moins deux valeurs).
function derPermutations(n, f) { const a = Array.from({ length: n }, (_, i) => i), c = new Array(n).fill(0); f(a); let i = 0;
  while (i < n) { if (c[i] < i) { const j = i % 2 ? c[i] : 0; [a[j], a[i]] = [a[i], a[j]]; f(a); c[i]++; i = 0; } else { c[i] = 0; i++; } } }
function derangements(P, n) {
  const N = P.objets, rng = mulberry32(P.graine), tous = []; let compte = 0; derPermutations(N, (a) => { if (a.every((v, i) => v !== i)) { compte++; tous.push(a.slice()); } });
  const Dr = [1n, 0n]; for (let m = 2; m <= 30; m++) Dr.push(BigInt(m - 1) * (Dr[m - 1] + Dr[m - 2]));
  let fact = 1n, ecartsIE = 0; for (let m = 0; m <= 30; m++) { if (m > 0) fact *= BigInt(m); let s = 0n, f = fact; for (let k = 0; k <= m; k++) { if (k > 0) f /= BigInt(k); s += (k % 2 ? -1n : 1n) * f; } if (s !== Dr[m]) ecartsIE++; }
  const K = 30; let KF = 1n; for (let k = 1; k <= K; k++) KF *= BigInt(k); let A = 0n, q = KF; for (let k = 0; k <= K; k++) { if (k > 0) q /= BigInt(k); A += q; }
  let ecartsE = 0, mf = 1n; for (let m = 1; m <= 30; m++) { mf *= BigInt(m); const d2 = 2n * Dr[m]; if (!(2n * mf * KF < (d2 + 1n) * A && 2n * mf * KF * BigInt(K) > (d2 - 1n) * (A * BigInt(K) + 1n))) ecartsE++; }
  const e = expPosD(1);
  const s = tous[Math.floor(rng() * tous.length)];
  const brut = new Float64Array(n * 3); for (let l = 0; l < n; l++) { const i = l % N, o = 3 * l; brut[o] = i; brut[o + 1] = s[i]; brut[o + 2] = s[i] - i; }
  return { D: 3, brut, nuage: true, unite: 'objets', invariants: {
    derangements: { mesure: (compte === Number(Dr[N]) ? 0 : 1) + ecartsIE, formule: 0, compte, douze: Dr.slice(0, 13).join(', '), note: 'enumerated derangements of n against D(n), plus m <= 30 where inclusion-exclusion (exact integers) and the recurrence disagree' },
    arrondiE: { mesure: ecartsE, formule: 0, note: 'm from 1 to 30 where D(m) is not the whole number nearest to m!/e' },
    temoin: { mesure: Math.round(1 / e), formule: 0, vrai: 1, note: 'witness: m = 0 : D(0) = 1, but the nearest whole number to 0!/e is 0 — the rounding rule starts at m = 1' } } };
}

// ---------- 53 : les nombres harmoniques (idee et valeurs : codex Grok Bot ; MathWorld « Harmonic Number », OEIS A001008 / A002805, lus par Grok) ----------
// H(n) = 1 + 1/2 + ... + 1/n, en FRACTIONS EXACTES (BigInt, reduites a chaque pas), jusqu au rang du curseur.
// Mesure pour chaque n : ln(n + 1) < H(n) <= 1 + ln(n) ; pour n >= 2 le denominateur reduit contient EXACTEMENT 2^floor(log2 n)
//   (un seul terme 1/k porte cette puissance de 2 : c est la preuve classique que H(n) n est jamais entier pour n >= 2).
// H(1..12) et H(20) : valeurs de Grok. Seuils : premiers n ou H(n) depasse 2, 3, 4 et 5 CALCULES ici (pas affirmes).
// Temoin : n = 1, H(1) = 1 est entier.
// Dessin (vue de face) : (n / N, H(n) - ln n) ; etiquette = exposant de 2 dans le denominateur.
function harmPgcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a < 0n ? -a : a; }
function nombresHarmoniques(P, n) {
  const N = P.rangs, nums = [0n], dens = [1n]; let hn = 0n, hd = 1n;
  for (let k = 1; k <= N; k++) { const a = hn * BigInt(k) + hd, b = hd * BigInt(k); let g = harmPgcd(a, b); hn = a / g; hd = b / g; nums.push(hn); dens.push(hd); }
  let horsBornes = 0, entiers = 0, deux = 0; const v2 = [0], seuils = [];
  for (let k = 1; k <= N; k++) { const hk = Number(nums[k]) / Number(dens[k]); if (!(lnD(k + 1) < hk && hk <= 1 + lnD(k) + 1e-12)) horsBornes++;
    let d = dens[k], e = 0; while (d % 2n === 0n) { d /= 2n; e++; } v2.push(e); let f = 0, p = 1; while (p * 2 <= k) { p *= 2; f++; }
    if (k >= 2 && dens[k] === 1n) entiers++; if (k >= 2 && e !== f) deux++;
    for (const s of [2, 3, 4, 5]) if (seuils.length === s - 2 && nums[k] > BigInt(s) * dens[k]) seuils.push(k); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const k = 1 + Math.floor(l * N / n), o = 3 * l; brut[o] = k / N; brut[o + 1] = Number(nums[k]) / Number(dens[k]) - lnD(k); brut[o + 2] = v2[k]; }
  const fr = (k) => dens[k] === 1n ? String(nums[k]) : nums[k] + '/' + dens[k];
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    nombresHarmoniques: { mesure: horsBornes + entiers + deux, formule: 0, douze: Array.from({ length: 12 }, (_, i) => fr(i + 1)).join(', '), vingt: fr(20), seuils: seuils.join(' '), note: 'n up to the slider where H(n) leaves ln(n + 1) < H(n) <= 1 + ln n, or (n >= 2) is a whole number, or its denominator does not hold exactly 2^floor(log2 n)' },
    temoin: { mesure: Number(dens[1]), formule: 1, note: 'witness: n = 1 : H(1) = 1 is a whole number — the rule starts at n = 2' } } };
}

// ---------- 54 : la suite de Collatz (Syracuse) (idee et valeurs : codex Grok Bot ; MathWorld « Collatz Problem », OEIS A006577, lus par Grok) ----------
// n pair -> n/2 ; n impair -> 3n + 1. Conjecture OUVERTE : toute trajectoire finit par 1. Ici on ne prouve RIEN de general :
//   chaque depart 1..N est SUIVI (plafond de 10 000 pas : un depart qui le depasse compte comme echec, la boucle s arrete toujours).
// Mesure : chaque depart <= N atteint 1 ; vol(2m) = vol(m) + 1 ; vol(1..20) = valeurs de Grok. Record (plus long vol, altitude) CALCULE.
// Temoin : la variante 3n - 1 ; partie de 5 elle REVIENT sur 5 sans passer par 1 (un cycle) : la regle « tout finit par 1 » tient a 3n + 1.
// Dessin (vue de face) : (depart / N, vol / plus long vol) ; etiquette = nombre de pas impairs (3n + 1).
function syrVol(x0, impair) { let x = x0, pas = 0, montees = 0, alt = x0; while (x !== 1 && pas < 10000) { if (x % 2) { x = impair(x); montees++; } else x /= 2; pas++; alt = Math.max(alt, x); } return [x === 1 ? pas : -1, montees, alt]; }
function suiteCollatz(P, n) {
  const N = P.limite, vols = [0], monts = [0]; let echecs = 0, record = 1, altRecord = 1;
  for (let d = 1; d <= N; d++) { const [v, m, a] = syrVol(d, (x) => 3 * x + 1); if (v < 0) echecs++; vols.push(v); monts.push(m); if (v > vols[record]) { record = d; altRecord = a; } }
  let doubles = 0; for (let m = 1; 2 * m <= N; m++) if (vols[2 * m] !== vols[m] + 1) doubles++;
  let t = 5, retour = 0; for (let k = 0; k < 50; k++) { t = t % 2 ? 3 * t - 1 : t / 2; if (t === 5) { retour = 1; break; } if (t === 1) break; }
  const brut = new Float64Array(n * 3), vmax = vols[record];
  for (let l = 0; l < n; l++) { const d = 1 + Math.floor(l * N / n), o = 3 * l; brut[o] = d / N; brut[o + 1] = vols[d] / vmax; brut[o + 2] = monts[d]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    suiteCollatz: { mesure: echecs + doubles, formule: 0, vingt: vols.slice(1, 21).join(', '), record: record + ' en ' + vols[record] + ' pas, altitude ' + altRecord, note: 'starts up to the slider that do not reach 1 within 10000 steps, plus m where flight(2m) differs from flight(m) + 1 — a finite check, not a proof' },
    temoin: { mesure: retour, formule: 1, note: 'witness: with 3n - 1 instead of 3n + 1, the start 5 comes back to 5 and never reaches 1 (a cycle)' } } };
}

// ---------- 55 : la routine de Kaprekar (idee et valeurs : codex Grok Bot ; MathWorld « Kaprekar Routine », lu par Grok) ----------
// Prendre un nombre a L chiffres (zeros en tete GARDES), ranger ses chiffres en ordre decroissant puis croissant, soustraire ; recommencer.
// Exact ici : les 10^L departs sont TOUS suivis (plafond de 20 pas). Mesure : tous ceux qui n ont pas leurs L chiffres egaux tombent
//   sur UN MEME point fixe (K(c) = c), calcule ici et non affirme. Pour L = 4 : distribution des pas = celle de Grok (exhaustive, max 7).
// Temoin : les nombres a chiffres tous egaux (1111...) donnent 0 au premier pas et n atteignent jamais le point fixe.
// Dessin (vue de face) : (depart / 10^L, pas / plus grand nombre de pas) ; etiquette = nombre de chiffres differents du depart.
function kapPas(x, L) { const kc = String(x).padStart(L, '0').split(''), kd = kc.slice().sort(), kg = kd.slice().reverse(); return Number(kg.join('')) - Number(kd.join('')); }
function routineKaprekar(P, n) {
  const L = P.longueurK, tot = 10 ** L, pasDe = new Array(tot).fill(0), finale = new Array(tot); const egaux = (x) => new Set(String(x).padStart(L, '0')).size === 1;
  const kt = new Int32Array(tot); for (let x = 0; x < tot; x++) kt[x] = kapPas(x, L);
  for (let x = 0; x < tot; x++) { let y = x, k = 0; while (k < 20 && kt[y] !== y) { y = kt[y]; k++; } pasDe[x] = k; finale[x] = kt[y] === y ? y : -1; }
  const fixes = new Set(); let perdus = 0; const distrib = {};
  for (let x = 0; x < tot; x++) { if (egaux(x)) continue; if (finale[x] < 0) perdus++; else fixes.add(finale[x]); distrib[pasDe[x]] = (distrib[pasDe[x]] || 0) + 1; }
  const constante = fixes.size === 1 ? [...fixes][0] : -1, pmax = Math.max(...Object.keys(distrib).map(Number));
  const rep = Number('1'.repeat(L)), brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const x = Math.floor(l * tot / n), o = 3 * l; brut[o] = x / tot; brut[o + 1] = pasDe[x] / pmax; brut[o + 2] = new Set(String(x).padStart(L, '0')).size; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    routineKaprekar: { mesure: perdus + (fixes.size === 1 ? 0 : 1), formule: 0, pointFixe: constante, pmax, distribution: Object.keys(distrib).sort((a, b) => a - b).map((k) => k + ':' + distrib[k]).join(' '), note: 'starts (digits not all equal) that do not settle on one single fixed point within 20 steps' },
    temoin: { mesure: kapPas(rep, L), formule: 0, note: 'witness: a number whose digits are all equal gives 0 at the first step and never reaches the fixed point' } } };
}

// ---------- 56 : nombres de Stirling (2e espece) et de Bell (idee et valeurs : codex Grok Bot ; MathWorld « Stirling Number of the Second Kind »,
//   « Bell Number », OEIS A008277 / A000110, lus par Grok) ----------
// S(n, k) = facons de couper un ensemble de n elements en k blocs non vides (blocs NON ordonnes) ; Bell(n) = toutes les facons.
// Exact ici : TOUTES les partitions de n <= 9 elements ENUMEREES (chaines a croissance restreinte : a0 = 0, ai <= max + 1) et comptees par blocs ;
//   pour m <= 20, recurrence S(m, k) = k S(m - 1, k) + S(m - 1, k - 1) en BigInt, et Bell(m) = somme des S(m, k) = triangle d Aitken (additions seules).
// S(n, k) pour n <= 8 et Bell(0..10) : valeurs de Grok.
// Temoin : des blocs ORDONNES (fonctions surjectives sur 2 etiquettes) se comptent 2^n - 2 = 2 S(n, 2) : le double, car on distingue A de B.
// Dessin (vue de face) : une partition tiree (graine), points (element / n, numero de son bloc) ; etiquette = blocs ouverts jusqu a lui.
function stirlingBell(P, n) {
  const N = P.elements, rng = mulberry32(P.graine), comptes = new Array(N + 1).fill(0), rgsPart = new Array(N).fill(0);
  let total = 0, vise = -1, tiree = null;
  const parcours = (i, ouverts) => { if (i === N) { comptes[ouverts]++; if (total === vise) tiree = rgsPart.slice(); total++; return; }
    for (let b = 0; b <= ouverts && b < N; b++) { rgsPart[i] = b; parcours(i + 1, b === ouverts ? ouverts + 1 : ouverts); } };
  parcours(0, 0); vise = Math.floor(rng() * total); total = 0; comptes.fill(0); parcours(0, 0);
  const Sr = [[1n]]; for (let m = 1; m <= 20; m++) { const r = [0n]; for (let k = 1; k <= m; k++) r.push(BigInt(k) * (Sr[m - 1][k] || 0n) + (Sr[m - 1][k - 1] || 0n)); Sr.push(r); }
  const aitken = [1n]; let rang = [1n]; for (let m = 1; m <= 20; m++) { const nv = [rang[rang.length - 1]]; for (const x of rang) nv.push(nv[nv.length - 1] + x); rang = nv; aitken.push(rang[0]); }
  let ecarts = 0; for (let k = 1; k <= N; k++) if (BigInt(comptes[k]) !== Sr[N][k]) ecarts++;
  for (let m = 0; m <= 20; m++) if (Sr[m].reduce((a, b) => a + b, 0n) !== aitken[m]) ecarts++;
  let surj = 0; for (let x = 0; x < 2 ** N; x++) if (x !== 0 && x !== 2 ** N - 1) surj++;
  const blocs = Math.max(...tiree) + 1, brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const i = l % N, o = 3 * l; brut[o] = i / N; brut[o + 1] = tiree[i] / Math.max(1, blocs - 1); brut[o + 2] = Math.max(...tiree.slice(0, i + 1)) + 1; }
  return { D: 3, brut, nuage: true, unite: 'elements', invariants: {
    stirlingBell: { mesure: ecarts, formule: 0, ligneHuit: Sr[8].slice(1).join(', '), bellOnze: aitken.slice(0, 11).join(', '), partitions: comptes.slice(1).join(' '), note: 'enumerated partitions of n per block count against the recurrence, plus m <= 20 where the sum of S(m, k) differs from the Aitken triangle' },
    temoin: { mesure: surj / Number(Sr[N][2]), formule: 1, vrai: 2, note: 'witness: ORDERED blocks (onto maps to 2 labels) count 2^n - 2, exactly twice S(n, 2): naming the blocks A and B counts each split twice' } } };
}

// ---------- 57 : les nombres de Motzkin (idee et valeurs : codex Grok Bot ; MathWorld « Motzkin Number », OEIS A001006, lus par Grok) ----------
// M(n) = chemins de n pas (montee, descente, palier) de la hauteur 0 a la hauteur 0 sans jamais passer sous 0.
// Exact ici : chemins de longueur n <= 13 ENUMERES un par un (retour arriere, coupe des que la hauteur depasse les pas restants) ;
//   pour m <= 40, recurrence M(m) = M(m - 1) + somme M(k) M(m - 2 - k) en BigInt = somme des C(m, 2k) Catalan(k) (autre idee :
//   placer les montees et descentes, puis les apparier comme des parentheses). M(0..15) : valeurs de Grok.
// Temoin : sans la contrainte « jamais sous 0 », 3 chemins de longueur 2 (UD, DU, FF) au lieu de M(2) = 2.
// Dessin (vue de face) : un chemin tire UNIFORMEMENT (graine ; table des completions), points (pas / n, hauteur relative) ;
//   etiquette = sorte de pas (0 palier, 1 montee, 2 descente).
function motzkinChemins(P, n) {
  const N = P.longueurM, rng = mulberry32(P.graine);
  const motzCompte = (i, h) => { if (h > N - i) return 0; if (i === N) return 1; return motzCompte(i + 1, h) + motzCompte(i + 1, h + 1) + (h > 0 ? motzCompte(i + 1, h - 1) : 0); };
  const compte = motzCompte(0, 0);
  const Mr = [1n, 1n]; for (let m = 2; m <= 40; m++) { let s = Mr[m - 1]; for (let k = 0; k <= m - 2; k++) s += Mr[k] * Mr[m - 2 - k]; Mr.push(s); }
  const binM = (a, b) => { let r = 1n; for (let j = 1; j <= b; j++) r = r * BigInt(a - b + j) / BigInt(j); return r; };
  let ecarts = compte === Number(Mr[N]) ? 0 : 1;
  for (let m = 0; m <= 40; m++) { let s = 0n; for (let k = 0; 2 * k <= m; k++) s += binM(m, 2 * k) * (binM(2 * k, k) / BigInt(k + 1)); if (s !== Mr[m]) ecarts++; }
  let libres = 0; for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) if (a + b === 0) libres++;
  const W = Array.from({ length: N + 1 }, () => new Array(N + 2).fill(0)); W[N][0] = 1;
  for (let i = N - 1; i >= 0; i--) for (let h = 0; h <= N; h++) W[i][h] = W[i + 1][h] + (W[i + 1][h + 1] || 0) + (h > 0 ? W[i + 1][h - 1] : 0);
  const haut = [0], sorte = []; let h = 0;
  for (let i = 0; i < N; i++) { const t = rng() * W[i][h], pal = W[i + 1][h], mon = W[i + 1][h + 1] || 0;
    if (t < pal) sorte.push(0); else if (t < pal + mon) { sorte.push(1); h++; } else { sorte.push(2); h--; } haut.push(h); }
  const hmax = Math.max(1, ...haut), brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const i = l % N, o = 3 * l; brut[o] = (i + 1) / N; brut[o + 1] = haut[i + 1] / hmax; brut[o + 2] = sorte[i]; }
  return { D: 3, brut, nuage: true, unite: 'pas', invariants: {
    motzkinChemins: { mesure: ecarts, formule: 0, compte, seize: Mr.slice(0, 16).join(', '), note: 'enumerated paths of length n against M(n), plus m <= 40 where the recurrence and the sum of C(m, 2k) Catalan(k) disagree' },
    temoin: { mesure: libres, formule: Number(Mr[2]), note: 'witness: without the floor at 0 there are 3 paths of length 2 (UD, DU, FF), not M(2) = 2' } } };
}

// ---------- 58 : les periodes de Pisano (idee et valeurs : codex Grok Bot ; OEIS A001175, b-file lu par Grok) ----------
// Fibonacci modulo m revient toujours a la paire (0, 1) : pi(m) = longueur de ce cycle. Exact ici : chaque m <= M suivi jusqu au retour
//   (plafond 6m + 10 pas : une boucle qui ne revient pas s arrete et compte comme echec). pi(1..30) : valeurs de Grok.
// MESURE (pas affirme) : pi(ab) = ppcm(pi(a), pi(b)) pour a, b premiers entre eux avec ab <= M ; pi(m) pair pour m > 2 ; pi(m) <= 6m,
//   et les m qui atteignent 6m sont CALCULES ici. Etiquette = zeros de Fibonacci dans un cycle (compte).
// Temoin : m = 2, pi(2) = 3 est impair : la parite ne vaut qu a partir de m = 3.
function pisanoPer(m) { if (m === 1) return [1, 1]; let a = 0, b = 1, k = 0, zeros = 0; do { [a, b] = [b, (a + b) % m]; k++; if (a === 0) zeros++; } while (!(a === 0 && b === 1) && k < 6 * m + 10); return [a === 0 && b === 1 ? k : -1, zeros]; }
function ppcmP(x, y) { let p = x, q = y; while (q) { [p, q] = [q, p % q]; } return x / p * y; }
function periodePisano(P, n) {
  const M = P.moduleMax, per = [0], zer = [0]; let perdus = 0;
  for (let m = 1; m <= M; m++) { const [k, z] = pisanoPer(m); if (k < 0) perdus++; per.push(k); zer.push(z); }
  const pgcdP = (x, y) => { while (y) { [x, y] = [y, x % y]; } return x; };
  let ppcmFaux = 0, impairs = 0, auDela = 0; const sixM = [];
  for (let a = 2; a <= M; a++) for (let b = a + 1; a * b <= M; b++) if (pgcdP(a, b) === 1 && per[a * b] !== ppcmP(per[a], per[b])) ppcmFaux++;
  for (let m = 3; m <= M; m++) if (per[m] % 2) impairs++;
  for (let m = 1; m <= M; m++) { if (per[m] > 6 * m) auDela++; if (per[m] === 6 * m) sixM.push(m); }
  const pmax = Math.max(...per), brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const m = 1 + (l % M), o = 3 * l; brut[o] = m / M; brut[o + 1] = per[m] / pmax; brut[o + 2] = zer[m]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    periodePisano: { mesure: perdus + ppcmFaux + impairs + auDela, formule: 0, trente: per.slice(1, 31).join(', '), sixM: sixM.join(' '), note: 'm up to the slider whose cycle does not close, coprime pairs where pi(ab) is not lcm(pi(a), pi(b)), odd periods beyond m = 2, and periods above 6m — measured' },
    temoin: { mesure: per[2] % 2, formule: 0, note: 'witness: pi(2) = 3 is odd — periods are even only from m = 3 on' } } };
}

// ---------- 59 : l indicatrice d Euler (idee et valeurs : codex Grok Bot ; OEIS A000010, b-file lu par Grok) ----------
// phi(n) = combien d entiers de 1 a n n ont aucun facteur commun avec n. Exact ici : crible jusqu a N (phi(m) = m, puis pour chaque
//   premier p, phi(multiple) -= phi(multiple) / p). phi(1..40) : valeurs de Grok.
// MESURE pour chaque n <= N : somme des phi(d) sur les diviseurs d de n = n ; phi(ab) = phi(a) phi(b) pour a, b premiers entre eux ;
//   phi(n) pair pour n > 2. Etiquette = nombre de facteurs premiers distincts de n.
// Temoin : la multiplicativite exige des facteurs premiers entre eux : phi(4) = 2, mais phi(2) phi(2) = 1.
function indicatriceEuler(P, n) {
  const N = P.jusquaN, totF = Array.from({ length: N + 1 }, (_, i) => i), nbP = new Array(N + 1).fill(0);
  for (let p = 2; p <= N; p++) if (totF[p] === p) for (let q = p; q <= N; q += p) { totF[q] -= totF[q] / p; nbP[q]++; }
  const somme = new Array(N + 1).fill(0); for (let d = 1; d <= N; d++) for (let q = d; q <= N; q += d) somme[q] += totF[d];
  const pgcdE = (x, y) => { while (y) { [x, y] = [y, x % y]; } return x; };
  let sommesFausses = 0, multFausses = 0, impairs = 0;
  for (let m = 1; m <= N; m++) { if (somme[m] !== m) sommesFausses++; if (m > 2 && totF[m] % 2) impairs++; }
  for (let a = 2; a * a <= N; a++) for (let b = a + 1; a * b <= N; b++) if (pgcdE(a, b) === 1 && totF[a * b] !== totF[a] * totF[b]) multFausses++;
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const m = 1 + Math.floor(l * N / n), o = 3 * l; brut[o] = m / N; brut[o + 1] = totF[m] / m; brut[o + 2] = nbP[m]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    indicatriceEuler: { mesure: sommesFausses + multFausses + impairs, formule: 0, quarante: totF.slice(1, 41).join(', '), note: 'n up to the slider where the sum of phi over the divisors is not n, coprime pairs where phi is not multiplicative, and odd phi beyond n = 2' },
    temoin: { mesure: totF[4], formule: totF[2] * totF[2], note: 'witness: 2 and 2 share a factor, so phi(4) = 2 differs from phi(2) phi(2) = 1' } } };
}

// ---------- 60 : la conjecture de Goldbach, en premiers IMPAIRS (idee et valeurs : codex Grok Bot ; OEIS A002375, b-file lu par Grok) ----------
// Conjecture OUVERTE : tout pair >= 6 est somme de deux premiers impairs. Ici on ne prouve RIEN de general : chaque pair E <= Emax est
//   decompose (crible), et les facons p + q (p <= q, premiers impairs) sont COMPTEES. Comptes pour E = 4..60 : valeurs de Grok (A002375 :
//   premiers IMPAIRS, donc 4 = 2 + 2 ne compte pas). Le plus petit nombre de facons au-dela de 6 est CALCULE et affiche.
// Temoin : E = 4 n a AUCUNE decomposition en premiers impairs (il faudrait 2 + 2) : la regle commence a 6.
// Dessin (vue de face) : (E / Emax, facons / plus grand nombre de facons) ; etiquette = reste de E modulo 3 (les multiples de 3 en ont plus).
function goldbachPaires(P, n) {
  const Emax = P.pairMax, crible = new Uint8Array(Emax + 1).fill(1); crible[0] = 0; crible[1] = 0;
  for (let p = 2; p * p <= Emax; p++) if (crible[p]) for (let q = p * p; q <= Emax; q += p) crible[q] = 0;
  const facons = new Array(Emax + 1).fill(0);
  for (let E = 4; E <= Emax; E += 2) for (let p = 3; p <= E / 2; p += 2) if (crible[p] && crible[E - p]) facons[E]++;
  let vides = 0; for (let E = 6; E <= Emax; E += 2) if (facons[E] === 0) vides++;
  let s3 = 0, n3 = 0, sA = 0, nA = 0; for (let E = 30; E <= Emax; E += 2) { if (E % 3 === 0) { s3 += facons[E]; n3++; } else { sA += facons[E]; nA++; } }
  const paires = []; for (let E = 4; E <= Emax; E += 2) paires.push(E);
  const fmax = Math.max(...facons), brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const E = paires[Math.floor(l * paires.length / n)], o = 3 * l; brut[o] = E / Emax; brut[o + 1] = facons[E] / fmax; brut[o + 2] = E % 3; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    goldbachPaires: { mesure: vides, formule: 0, soixante: paires.filter((E) => E <= 60).map((E) => facons[E]).join(', '), rapportMod3: (s3 / n3) / (sA / nA), note: 'even numbers from 6 to the slider with no split into two odd primes: a finite check of an open conjecture, not a proof' },
    temoin: { mesure: facons[4], formule: 0, note: 'witness: 4 has no split into two odd primes (it would need 2 + 2): the rule starts at 6' } } };
}

// ---------- 61 : le probleme de Frobenius a deux pieces (idee et valeurs : codex Grok Bot ; MathWorld « Coin Problem », « Frobenius Number »,
//   lus par Grok) ----------
// Avec des pieces a et b premieres entre elles, quels montants ne peut-on PAS payer ? Exact ici : pour chaque couple 2 <= a < b <= Bmax
//   premiers entre eux, les montants payables sont MARQUES (programmation dynamique jusqu a ab), puis le plus grand impossible et le
//   nombre d impossibles sont COMPTES et compares a ab - a - b et (a - 1)(b - 1)/2 (Sylvester). MESURE aussi la symetrie : pour
//   0 <= k <= g, un seul de k et g - k est payable. Grille a = 3..9, b = 4..11 : valeurs de Grok.
// Temoin : 6 et 9 partagent 3 : tout montant payable est multiple de 3, il n y a PAS de plus grand impossible (compte sur 1..300).
// Dessin (vue de face) : chaque couple (a / Bmax, b / Bmax) ; etiquette = nombre de montants impossibles.
function frobPayables(a, b, L) { const rep = new Uint8Array(L + 1); rep[0] = 1; for (let v = 1; v <= L; v++) rep[v] = (v >= a && rep[v - a]) || (v >= b && rep[v - b]) ? 1 : 0; return rep; }
function frobeniusPieces(P, n) {
  const Bmax = P.pieceMax, pgcdF = (x, y) => { while (y) { [x, y] = [y, x % y]; } return x; };
  const couples = []; let ecarts = 0, asym = 0;
  for (let a = 2; a <= Bmax; a++) for (let b = a + 1; b <= Bmax; b++) { if (pgcdF(a, b) !== 1) continue;
    const L = a * b, rep = frobPayables(a, b, L); let g = -1, nb = 0; for (let v = 1; v <= L; v++) if (!rep[v]) { g = v; nb++; }
    if (g !== a * b - a - b || nb !== (a - 1) * (b - 1) / 2) ecarts++;
    for (let k = 0; k <= g; k++) if (rep[k] + rep[g - k] !== 1) { asym++; break; }
    couples.push([a, b, g, nb]); }
  const r69 = frobPayables(6, 9, 300); let imp69 = 0; for (let v = 1; v <= 300; v++) if (!r69[v]) imp69++;
  const grille = couples.filter(([a, b]) => a <= 9 && b <= 11 && a >= 3 && b >= 4).map(([a, b, g, nb]) => a + ',' + b + ':' + g + '/' + nb).join(' ');
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [a, b, , nb] = couples[l % couples.length], o = 3 * l; brut[o] = a / Bmax; brut[o + 1] = b / Bmax; brut[o + 2] = nb; }
  return { D: 3, brut, nuage: true, unite: 'pieces', invariants: {
    frobeniusPieces: { mesure: ecarts + asym, formule: 0, couples: couples.length, grilleSylvester: grille, note: 'coprime coin pairs up to the slider whose counted largest impossible amount or count of impossible amounts differs from Sylvester, or that break the k / g - k symmetry' },
    temoin: { mesure: imp69, formule: (6 - 1) * (9 - 1) / 2, note: 'witness: 6 and 9 share 3, so every payable amount is a multiple of 3 and there is no largest impossible one: 1..300 holds far more impossible amounts than the formula would give' } } };
}

// ---------- 62 : les grands nombres de Schroder (idee et valeurs : codex Grok Bot ; OEIS A006318, b-file lu par Grok) ----------
// S(n) = chemins de (0, 0) a (2n, 0) en montees (1, 1), descentes (1, -1) et paliers DOUBLES (2, 0), jamais sous l axe.
// Exact ici : chemins de taille n <= 9 ENUMERES un par un ; pour m <= 30, convolution S(m) = S(m - 1) + somme S(k) S(m - 1 - k) en BigInt
//   = recurrence a trois termes (m + 1) S(m) = 3(2m - 1) S(m - 1) - (m - 2) S(m - 2). S(0..12) : valeurs de Grok.
// MESURE : S(m) pair pour 1 <= m <= 30 (les PETITS Schroder s(m) = S(m)/2 sont entiers).
// Temoin : S(0) = 1 est impair : s(0) = 1/2 n est pas un entier, les petits Schroder commencent a part (le piege signale par Grok).
// Dessin (vue de face) : un chemin tire UNIFORMEMENT (graine), points (x / 2n, hauteur relative) ; etiquette = sorte de pas.
function schroderChemins(P, n) {
  const T = P.longueurS, X = 2 * T, rng = mulberry32(P.graine);
  const schCompte = (x, y) => { if (y > X - x || y < 0) return 0; if (x === X) return 1; return schCompte(x + 1, y + 1) + schCompte(x + 1, y - 1) + (x + 2 <= X ? schCompte(x + 2, y) : 0); };
  const compte = schCompte(0, 0);
  const Sc = [1n]; for (let m = 1; m <= 30; m++) { let t = Sc[m - 1]; for (let k = 0; k <= m - 1; k++) t += Sc[k] * Sc[m - 1 - k]; Sc.push(t); }
  let ecarts = compte === Number(Sc[T]) ? 0 : 1, impairs = 0;
  for (let m = 2; m <= 30; m++) if (BigInt(m + 1) * Sc[m] !== 3n * BigInt(2 * m - 1) * Sc[m - 1] - BigInt(m - 2) * Sc[m - 2]) ecarts++;
  for (let m = 1; m <= 30; m++) if (Sc[m] % 2n) impairs++;
  const Wc = Array.from({ length: X + 3 }, () => new Array(X + 3).fill(0)); Wc[X][0] = 1;
  for (let x = X - 1; x >= 0; x--) for (let y = 0; y <= X; y++) Wc[x][y] = (Wc[x + 1][y + 1] || 0) + (y > 0 ? Wc[x + 1][y - 1] : 0) + (x + 2 <= X ? Wc[x + 2][y] : 0);
  const pts = [[0, 0, 0]]; let x = 0, y = 0;
  while (x < X) { const mo = Wc[x + 1][y + 1] || 0, de = y > 0 ? Wc[x + 1][y - 1] : 0, u = rng() * Wc[x][y];
    if (u < mo) { x++; y++; pts.push([x, y, 1]); } else if (u < mo + de) { x++; y--; pts.push([x, y, 2]); } else { x += 2; pts.push([x, y, 0]); } }
  const ymax = Math.max(1, ...pts.map((q) => q[1])), brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, sorte] = pts[1 + (l % (pts.length - 1))], o = 3 * l; brut[o] = px / X; brut[o + 1] = py / ymax; brut[o + 2] = sorte; }
  return { D: 3, brut, nuage: true, unite: 'pas', invariants: {
    schroderChemins: { mesure: ecarts + impairs, formule: 0, compte, treize: Sc.slice(0, 13).join(', '), note: 'enumerated paths vs S(n), m <= 30 where the convolution and the three-term recurrence disagree, and odd S(m) for m >= 1' },
    temoin: { mesure: Number(Sc[0] % 2n), formule: 0, note: 'witness: S(0) = 1 is odd, so the little Schroder number s(0) = S(0)/2 is not a whole number: the halving rule starts at 1' } } };
}

// ---------- 63 : le triangle de Narayana (idee et valeurs : codex Grok Bot ; OEIS A001263, b-file lu par Grok) ----------
// N(n, k) = chemins de Dyck de demi-longueur n (montees et descentes, jamais sous l axe) qui ont exactement k SOMMETS (une montee suivie
//   d une descente). Exact ici : tous les chemins de Dyck de taille n <= N ENUMERES et comptes par sommets = C(n, k) C(n, k - 1) / n
//   (BigInt) ; MESURE : chaque ligne somme au nombre de Catalan C(2n, n)/(n + 1) et est SYMETRIQUE (N(n, k) = N(n, n + 1 - k)).
//   Lignes n = 1..8 : valeurs de Grok.
// Temoin : compter par RETOURS a l axe au lieu de sommets donne une autre ligne, NON symetrique (n = 3 : 2, 2, 1 au lieu de 1, 3, 1).
// Dessin (vue de face) : le triangle, points (k / (n + 1), N(n, k) / maximum de la ligne) ; etiquette = la ligne n.
function triangleNarayana(P, n) {
  const N = P.rangN, ligne = [null], retours3 = [0, 0, 0, 0];
  const binN = (a, b) => { if (b < 0 || b > a) return 0n; let r = 1n; for (let j = 1; j <= b; j++) r = r * BigInt(a - b + j) / BigInt(j); return r; };
  let ecarts = 0, asym = 0;
  for (let m = 1; m <= N; m++) { const parSommets = new Array(m + 2).fill(0);
    const dyck = (i, h, sommets, avant, ret) => { if (h < 0 || h > 2 * m - i) return; if (i === 2 * m) { parSommets[sommets]++; if (m === 3) retours3[ret]++; return; }
      dyck(i + 1, h + 1, sommets, 1, ret); dyck(i + 1, h - 1, sommets + (avant === 1 ? 1 : 0), -1, ret + (h - 1 === 0 ? 1 : 0)); };
    dyck(0, 0, 0, 0, 0); ligne.push(parSommets.slice(1, m + 1));
    let somme = 0n; for (let k = 1; k <= m; k++) { const f = binN(m, k) * binN(m, k - 1) / BigInt(m); somme += f; if (BigInt(parSommets[k]) !== f) ecarts++; if (parSommets[k] !== parSommets[m + 1 - k]) asym++; }
    if (somme !== binN(2 * m, m) / BigInt(m + 1)) ecarts++; }
  const pts = []; for (let m = 1; m <= N; m++) { const mx = Math.max(...ligne[m]); for (let k = 1; k <= m; k++) pts.push([k / (m + 1), ligne[m][k - 1] / mx, m]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [a, b, c] = pts[l % pts.length], o = 3 * l; brut[o] = a; brut[o + 1] = b; brut[o + 2] = c; }
  const r3 = retours3.slice(1, 4), r3sym = r3[0] === r3[2] ? 0 : 1;
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    triangleNarayana: { mesure: ecarts + asym, formule: 0, huitLignes: ligne.slice(1, 9).map((r) => r.join(' ')).join(' | '), note: 'rows up to the slider where the enumerated peak counts differ from C(n, k) C(n, k - 1) / n, do not add up to Catalan, or are not symmetric' },
    temoin: { mesure: r3sym, formule: 0, retoursTrois: r3.join(' '), note: 'witness: counting the same paths by returns to the axis gives 2 2 1 for n = 3, not symmetric, unlike the peak counts 1 3 1' } } };
}

// ---------- 64 : la suite de Recaman (idee et valeurs : codex Grok Bot ; OEIS A005132, b-file lu par Grok) ----------
// a(0) = 0 ; a(n) = a(n - 1) - n si ce nombre est > 0 et JAMAIS vu, sinon a(n - 1) + n. Exact ici : N termes construits.
// MESURE sur chaque terme : le saut vaut exactement n, et chaque choix suit la regle (reculer quand c etait permis, avancer sinon).
//   a(0..40) et premier terme repete (42 = a(20) = a(24)) : valeurs de Grok. La conjecture « tout entier finit par apparaitre » n est
//   PAS affirmee : le plus petit entier encore absent est CALCULE et affiche.
// Temoin : l interdiction de revoir un nombre ne vaut que pour le RECUL : en avancant, a(24) = 18 + 24 = 42 retombe sur a(20).
// Dessin (vue de face) : (n / N, a(n) / plus grand terme) ; etiquette = sens du saut (0 recul, 1 avance).
function suiteRecaman(P, n) {
  const N = P.rangR, rec = [0], vus = new Set([0]), sens = [1]; let fautes = 0, repete = null;
  for (let k = 1; k <= N; k++) { const ar = rec[k - 1] - k, v = ar > 0 && !vus.has(ar) ? ar : rec[k - 1] + k;
    if (repete === null && vus.has(v)) repete = [v, rec.indexOf(v), k];
    rec.push(v); vus.add(v); sens.push(v < rec[k - 1] ? 0 : 1); }
  const vus2 = new Set([0]);
  for (let k = 1; k <= N; k++) { const d = rec[k] - rec[k - 1], reculPermis = rec[k - 1] - k > 0 && !vus2.has(rec[k - 1] - k);
    if (Math.abs(d) !== k || (reculPermis ? d !== -k : d !== k)) fautes++; vus2.add(rec[k]); }
  let absent = 0; while (vus.has(absent)) absent++;
  const amax = Math.max(...rec), brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const k = Math.floor(l * (N + 1) / n), o = 3 * l; brut[o] = k / N; brut[o + 1] = rec[k] / amax; brut[o + 2] = sens[k]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    suiteRecaman: { mesure: fautes, formule: 0, quarante: rec.slice(0, 41).join(', '), premierRepete: repete ? repete.join(' ') : 'none', plusPetitAbsent: absent, note: 'terms up to the slider whose jump is not exactly n, or that did not step back when stepping back was allowed (or stepped back when it was not)' },
    temoin: { mesure: repete && repete[0] === 42 ? 1 : 0, formule: 0, note: 'witness: the no-repeat rule only applies when stepping BACK: stepping forward, a(24) = 18 + 24 = 42 lands on a(20) again' } } };
}

// ---------- 65 : la suite de Kolakoski (idee et valeurs : codex Grok Bot ; OEIS A000002, MathWorld « Kolakoski Sequence », lus par Grok) ----------
// Une suite de 1 et de 2 qui se DECRIT elle-meme : la longueur de ses paquets successifs de chiffres egaux redonne la suite.
// Exact ici : N termes construits depuis 1, 2, 2 (chaque terme lu dit combien de fois ecrire le chiffre suivant, en alternant 1 et 2).
// MESURE : les longueurs des paquets complets redonnent exactement le debut de la suite. 60 premiers termes et 30 « 1 » : valeurs de Grok.
//   La proportion de 1 est CALCULEE et affichee ; qu elle tende vers 1/2 est une conjecture OUVERTE, pas affirmee ici.
// Temoin : 1, 2, 1, 2, ... alterne aussi les chiffres, mais ses paquets ont tous la longueur 1 : il ne se decrit pas lui-meme.
// Dessin (vue de face) : (k / N, exces de 1 sur 2 parmi les k premiers termes / plus grand exces) ; etiquette = le terme (1 ou 2).
function kolLongueurs(t) { const r = []; let i = 0; while (i < t.length) { let j = i; while (j < t.length && t[j] === t[i]) j++; r.push(j - i); i = j; } return r; }
function suiteKolakoski(P, n) {
  const N = P.rangK, kol = [1, 2, 2]; let lu = 2;
  while (kol.length < N) { const chiffre = kol[kol.length - 1] === 1 ? 2 : 1; for (let r = 0; r < kol[lu]; r++) kol.push(chiffre); lu++; }
  kol.length = N;
  const runs = kolLongueurs(kol).slice(0, -1); let fautes = 0; for (let i = 0; i < runs.length; i++) if (runs[i] !== kol[i]) fautes++;
  let uns = 0; const exces = []; for (let k = 0; k < N; k++) { if (kol[k] === 1) uns++; exces.push(2 * uns - (k + 1)); }
  const excesMax = Math.max(1, ...exces.map(Math.abs));
  const alt = Array.from({ length: 20 }, (_, i) => (i % 2 ? 2 : 1)), altRuns = kolLongueurs(alt); let ecartAlt = -1; for (let i = 0; i < altRuns.length; i++) if (altRuns[i] !== alt[i]) { ecartAlt = i; break; }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const k = Math.floor(l * N / n), o = 3 * l; brut[o] = (k + 1) / N; brut[o + 1] = exces[k] / excesMax; brut[o + 2] = kol[k]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    suiteKolakoski: { mesure: fautes, formule: 0, soixante: kol.slice(0, 60).join(''), unsSoixante: kol.slice(0, 60).filter((x) => x === 1).length, proportionUns: uns / N, note: 'complete runs up to the slider whose length differs from the matching term: the sequence must describe itself' },
    temoin: { mesure: ecartAlt, formule: -1, note: 'witness: 1, 2, 1, 2, ... also alternates its digits, but all its runs have length 1, so it stops describing itself at position 1' } } };
}

// ---------- 66 : la suite de Perrin (idee et valeurs : codex Grok Bot ; OEIS A001608, A013998, MathWorld « Perrin Pseudoprime », lus par Grok) ----------
// P(0) = 3, P(1) = 0, P(2) = 2, P(n) = P(n - 2) + P(n - 3). Si n est premier, n divise P(n). Exact ici : pour chaque n <= N, P(n) mod n
//   calcule en restant modulo n. MESURE : chaque premier p <= N divise P(p) ; les composes <= N qui divisent P(n) sont COMPTES.
//   P(0..25) : valeurs de Grok (BigInt).
// Temoin : la reciproque est FAUSSE. 271441 (plus petit pseudo-premier de Perrin selon Grok, A013998) : son diviseur est CHERCHE ici
//   (divisions successives), et P(271441) mod 271441 est CALCULE par puissance de la matrice compagnon modulo 271441 : il vaut 0.
// Dessin (vue de face) : (n / N, (P(n) mod n) / n) ; etiquette = 1 si n est premier.
function perrinModulo(m) { if (m === 1) return 0; let a = 3 % m, b = 0, c = 2 % m; for (let k = 0; k < m; k++) [a, b, c] = [b, c, (a + b) % m]; return a; }
function perrinMatrice(m) {
  const mul = (X, Y) => X.map((ligne) => Y[0].map((_, j) => (ligne[0] * Y[0][j] + ligne[1] * Y[1][j] + ligne[2] * Y[2][j]) % m));
  let R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], A = [[0, 1, 0], [0, 0, 1], [1, 1, 0]], e = m;
  while (e > 0) { if (e % 2) R = mul(R, A); A = mul(A, A); e = Math.floor(e / 2); }
  return (R[0][0] * 3 + R[0][1] * 0 + R[0][2] * 2) % m;
}
function suitePerrin(P, n) {
  const N = P.perrinMax, premier = new Uint8Array(N + 1).fill(1); premier[0] = 0; premier[1] = 0;
  for (let p = 2; p * p <= N; p++) if (premier[p]) for (let q = p * p; q <= N; q += p) premier[q] = 0;
  const reste = [0]; let premiersRates = 0, composesDivisent = 0;
  for (let m = 1; m <= N; m++) { const r = perrinModulo(m); reste.push(r); if (premier[m] && r !== 0) premiersRates++; if (m > 1 && !premier[m] && r === 0) composesDivisent++; }
  const Pb = [3n, 0n, 2n]; for (let k = 3; k <= 25; k++) Pb.push(Pb[k - 2] + Pb[k - 3]);
  const temoinN = 271441; let diviseur = 0; for (let d = 2; d * d <= temoinN; d++) if (temoinN % d === 0) { diviseur = d; break; }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const m = 1 + Math.floor(l * N / n), o = 3 * l; brut[o] = m / N; brut[o + 1] = reste[m] / m; brut[o + 2] = premier[m]; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    suitePerrin: { mesure: premiersRates, formule: 0, composesDivisent, vingtSix: Pb.join(', '), note: 'primes p up to the slider that do not divide P(p); composites that do divide P(n) are counted separately (composesDivisent)' },
    temoin: { mesure: perrinMatrice(temoinN), formule: 0, diviseur, note: 'witness: 271441 is composite (its divisor is found here) and still divides P(271441): the converse fails' } } };
}

// ---------- 67 : la suite de Thue-Morse (idee et valeurs : codex Grok Bot ; OEIS A010060, MathWorld « Thue-Morse Sequence », lus par Grok) ----------
// t(n) = parite du nombre de bits 1 de n : 0 1 1 0 1 0 0 1 ... Exact ici : N termes par la parite des bits = N termes par doublement
//   (0 -> 01 -> 0110 -> ..., chaque etape colle le complement) ; MESURE : aucun cube XXX dans le prefixe (toutes positions, |X| <= 24 ;
//   un prefixe fini ne prouve pas le theoreme infini) ; Prouhet-Tarry-Escott : pour chaque k <= K, les n < 2^k a t(n) = 0 et a t(n) = 1
//   ont les MEMES sommes de n^j pour j < k (BigInt). 64 premiers termes : valeurs de Grok.
// Temoin : a j = k les deux sommes DIFFERENT : l egalite s arrete exactement la.
// Dessin (vue de face) : une tortue qui avance sur 0 et tourne de 60 degres sur 1 ; etiquette = t(n).
function thueMorse(P, n) {
  const N = P.rangT, tmPar = (m) => { let c = 0; while (m) { c ^= m & 1; m >>= 1; } return c; }, tmBits = Array.from({ length: N }, (_, i) => tmPar(i));
  let dbl = [0]; while (dbl.length < N) dbl = dbl.concat(dbl.map((b) => 1 - b));
  let ecarts = 0; for (let i = 0; i < N; i++) if (dbl[i] !== tmBits[i]) ecarts++;
  let cubes = 0; const Lmax = Math.min(24, Math.floor(N / 3));
  for (let L = 1; L <= Lmax; L++) for (let i = 0; i + 3 * L <= N; i++) { let pareil = true; for (let j = 0; j < L && pareil; j++) if (tmBits[i + j] !== tmBits[i + L + j] || tmBits[i + j] !== tmBits[i + 2 * L + j]) pareil = false; if (pareil) cubes++; }
  let K = 1; while (2 ** (K + 1) <= N && K < 10) K++;
  let pteFaux = 0; for (let k = 2; k <= K; k++) for (let j = 0; j < k; j++) { let s0 = 0n, s1 = 0n; for (let m = 0; m < 2 ** k; m++) { const p = BigInt(m) ** BigInt(j); if (tmBits[m]) s1 += p; else s0 += p; } if (s0 !== s1) pteFaux++; }
  let t0 = 0n, t1 = 0n; for (let m = 0; m < 2 ** K; m++) { const p = BigInt(m) ** BigInt(K); if (tmBits[m]) t1 += p; else t0 += p; }
  const pas = [[0, 0]]; let cap = 0, x = 0, y = 0; for (let i = 0; i < N; i++) { if (tmBits[i]) cap = (cap + 1) % 6; else { x += cosD(cap * PI / 3); y += sinD(cap * PI / 3); } pas.push([x, y]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const i = Math.floor(l * N / n), o = 3 * l; brut[o] = pas[i + 1][0]; brut[o + 1] = pas[i + 1][1]; brut[o + 2] = tmBits[i]; }
  return { D: 3, brut, nuage: true, unite: 'pas', invariants: {
    thueMorse: { mesure: ecarts + cubes + pteFaux, formule: 0, soixanteQuatre: tmBits.slice(0, 64).join(''), rangK: K, note: 'terms where bit parity and doubling disagree, cubes XXX found in the prefix (|X| <= 24), and power sums j < k that differ between the two halves' },
    temoin: { mesure: t0 === t1 ? 0 : 1, formule: 0, vrai: 1, note: 'witness: at j = k the power sums of the two halves differ: the Prouhet-Tarry-Escott equality stops exactly there' } } };
}

// ---------- 68 : la suite de Padovan (idee et valeurs : codex Grok Bot ; OEIS A000931, b-file lu par Grok) ----------
// Convention OEIS : P(0) = 1, P(1) = P(2) = 0, P(n) = P(n - 2) + P(n - 3). Exact ici : N termes en BigInt. MESURE : la seconde
//   recurrence P(n) = P(n - 1) + P(n - 5) (n >= 5) ; le rapport P(n + 1)/P(n) compare a la racine reelle de x^3 = x + 1 (le nombre
//   plastique), CALCULEE par dichotomie (60 coupes), ecart relatif sous 1e-6 des n = 60. P(0..30) : valeurs de Grok.
// Temoin : le piege d indices signale par Grok : partir de 1, 1, 1 donne la MEME suite decalee ; le decalage est CHERCHE ici (5).
// Dessin (vue de face) : (n / N, ecart du rapport au nombre plastique / plus grand ecart) ; etiquette = signe de l ecart.
function suitePadovan(P, n) {
  const N = P.rangP, pad = [1n, 0n, 0n]; for (let k = 3; k <= N + 5; k++) pad.push(pad[k - 2] + pad[k - 3]);
  let ecarts = 0; for (let k = 5; k <= N; k++) if (pad[k] !== pad[k - 1] + pad[k - 5]) ecarts++;
  let lo = 1, hi = 2; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (m * m * m - m - 1 > 0) hi = m; else lo = m; } const rho = (lo + hi) / 2;
  const ratio = (k) => Number(pad[k + 1]) / Number(pad[k]);
  let loin = 0; for (let k = 60; k <= N; k++) if (Math.abs(ratio(k) / rho - 1) > 1e-6) loin++;
  const q = [1n, 1n, 1n]; for (let k = 3; k <= 40; k++) q.push(q[k - 2] + q[k - 3]);
  let decalage = -1; for (let s = 0; s <= 10 && decalage < 0; s++) { let ok = true; for (let k = 0; k <= 30; k++) if (q[k] !== pad[k + s]) { ok = false; break; } if (ok) decalage = s; }
  const ec = []; for (let k = 5; k < N; k++) ec.push([k, ratio(k) - rho]); const emax = Math.max(...ec.map((e) => Math.abs(e[1])));
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [k, e] = ec[Math.floor(l * ec.length / n)], o = 3 * l; brut[o] = k / N; brut[o + 1] = e / emax; brut[o + 2] = e > 0 ? 1 : 0; }
  return { D: 3, brut, nuage: true, unite: 'sans objet', invariants: {
    suitePadovan: { mesure: ecarts + loin, formule: 0, trenteEtUn: pad.slice(0, 31).join(', '), plastique: rho, note: 'n where P(n) is not P(n - 1) + P(n - 5), and n >= 60 where P(n + 1)/P(n) is more than 1e-6 away from the root of x^3 = x + 1' },
    temoin: { mesure: decalage, formule: 0, note: 'witness: starting from 1, 1, 1 instead gives the same numbers shifted by 5 places: the indexing must be checked' } } };
}

// ---------- 69 : la fourmi de Langton (idee et valeurs : codex Grok Bot ; Wikipedia « Langton's ant », MathWorld, lus par Grok) ----------
// Grille blanche, fourmi en (0, 0) cap nord ; sur blanc elle tourne a droite, sur noir a gauche, inverse la case et avance d une case.
// Exact ici : S pas simules (cases noires dans un ensemble, sans bord). MESURE : le dernier pas t ou le virage differe de celui du pas
//   t + 104 est CHERCHE (Grok : t = 9976, l autoroute commence au pas 9977) ; ensuite, sur toute la fenetre, la fourmi se deplace de
//   (-2, -2) en 104 pas avec le meme cap. Une simulation finie ne prouve pas la suite infinie.
// Temoin : une autre periode (52 ou 103) ne colle pas : ses desaccords apres le pas 10000 sont COMPTES.
// Dessin (vue de face) : les positions de la fourmi ; etiquette = couleur de la case qu elle vient de quitter.
function fourmiLangton(P, n) {
  const S = P.pasL, noires = new Set(), DX = [0, 1, 0, -1], DY = [1, 0, -1, 0];
  let x = 0, y = 0, cap = 0; const pos = [[0, 0, 0]], virage = [], couleur = [];
  for (let t = 0; t < S; t++) { const k = x + ',' + y, noir = noires.has(k);
    cap = noir ? (cap + 3) % 4 : (cap + 1) % 4; virage.push(noir ? -1 : 1);
    if (noir) noires.delete(k); else noires.add(k); couleur.push(noir ? 0 : 1);
    x += DX[cap]; y += DY[cap]; pos.push([x, y, cap]); }
  let dernier = -1; for (let t = 0; t + 104 < S; t++) if (virage[t] !== virage[t + 104]) dernier = t;
  let horsAutoroute = 0; for (let t = 10000; t + 104 <= S; t++) { const a = pos[t], b = pos[t + 104]; if (b[0] - a[0] !== -2 || b[1] - a[1] !== -2 || b[2] !== a[2]) horsAutoroute++; }
  let desaccord52 = 0, desaccord103 = 0; for (let t = 10000; t + 104 < S; t++) { if (virage[t] !== virage[t + 52]) desaccord52++; if (virage[t] !== virage[t + 103]) desaccord103++; }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const t = Math.floor(l * S / n), o = 3 * l; brut[o] = pos[t + 1][0]; brut[o + 1] = pos[t + 1][1]; brut[o + 2] = couleur[t]; }
  return { D: 3, brut, nuage: true, unite: 'cases', invariants: {
    fourmiLangton: { mesure: (dernier === 9976 ? 0 : 1) + horsAutoroute, formule: 0, dernierDesaccord: dernier, a10000: pos[10000].join(' '), a10104: pos[10104].join(' '), noiresFin: noires.size, note: 'last step whose turn differs 104 steps later must be 9976, and every step from 10000 on must move by (-2, -2) with the same heading in 104 steps' },
    temoin: { mesure: Math.min(desaccord52, desaccord103) > 0 ? 1 : 0, formule: 0, vrai: 1, desaccord52, desaccord103, note: 'witness: periods 52 and 103 do not fit the highway: their mismatches after step 10000 are counted' } } };
}

// ---------- 70 : la gamme temperee (idee et valeurs : codex Grok Bot 20 ; SFU « Handbook for Acoustic Ecology », D. Wright « Logarithms and
//   Musical Intervals », lus par Grok) ----------
// L octave (rapport 2) coupee en N pas egaux : chaque pas a le rapport 2^(1/N), CHERCHE ici par dichotomie sur x^N = 2 (pas de pow) ;
//   un intervalle de rapport r mesure 1200 log2 r cents (lnD). MESURE pour le N du curseur : ecart en cents de la quinte (3/2), de la
//   tierce majeure (5/4) et de la quarte (4/3) au pas le plus proche ; quinte + quarte font une octave, donc leurs ecarts sont OPPOSES.
//   Pour N = 12 : rapports 2^(k/12) et ecarts -1.955000865, +13.686286135, +1.955000865 cents = calculs de Grok.
// Temoin : douze quintes PURES ne retombent pas sur sept octaves : (3/2)^12 / 2^7 = 531441/524288 (fraction EXACTE en BigInt), la comma
//   pythagoricienne, environ 23.46 cents : c est pour la gommer qu on tempere.
// Dessin (vue de face) : chaque pas k de l octave (k / N, ecart en demi-tons au rapport simple le plus proche, rapports p/q avec q <= 8) ;
//   etiquette = k.
function gammeTemperee(P, n) {
  const N = P.divisions; let lo = 1, hi = 2; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; let x = 1; for (let j = 0; j < N; j++) x *= m; if (x > 2) hi = m; else lo = m; } const pasG = (lo + hi) / 2;
  const cents = (r) => 1200 * lnD(r) / lnD(2), rapports = [1]; for (let k = 1; k <= N; k++) rapports.push(rapports[k - 1] * pasG);
  const ecart = (p, q) => { const c = cents(p / q), k = Math.round(c * N / 1200); return cents(rapports[k]) - c; };
  const quinte = ecart(3, 2), tierce = ecart(5, 4), quarte = ecart(4, 3);
  let ecarts = (Math.abs(rapports[N] - 2) < 1e-12 ? 0 : 1) + (Math.abs(quinte + quarte) < 1e-9 || Math.round(cents(1.5) * N / 1200) + Math.round(cents(4 / 3) * N / 1200) !== N ? 0 : 1);
  const comma = [3n ** 12n, 2n ** 12n * 2n ** 7n], commaCents = cents(Number(comma[0]) / Number(comma[1]));
  const simples = []; for (let q = 1; q <= 8; q++) for (let p = q; p <= 2 * q; p++) simples.push(cents(p / q));
  const pts = []; for (let k = 0; k <= N; k++) { const c = cents(rapports[k]); let best = Infinity; for (const s of simples) if (Math.abs(c - s) < Math.abs(best)) best = c - s; pts.push([k / N, best / 100, k]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [a, b, c] = pts[l % pts.length], o = 3 * l; brut[o] = a; brut[o + 1] = b; brut[o + 2] = c; }
  return { D: 3, brut, nuage: true, unite: 'cents', invariants: {
    gammeTemperee: { mesure: ecarts, formule: 0, pasRapport: pasG, quinteCents: quinte, tierceCents: tierce, quarteCents: quarte, douze: N === 12 ? rapports.map((r) => r.toFixed(12)).join(' ') : 'N != 12',
      note: 'the N-th step must land on the octave 2 within 1e-12, and the fifth and fourth errors must cancel (they add up to an octave)' },
    temoin: { mesure: commaCents, formule: 0, commaFraction: comma[0] + '/' + comma[1], note: 'witness: twelve pure fifths overshoot seven octaves by 531441/524288, the Pythagorean comma, about 23.46 cents' } } };
}

// ---------- 71 : l entropie de Shannon et le code de Huffman (idee et valeurs : codex Grok Bot 20 ; effectifs : SOURCES, Cornell ;
//   formule H = -somme p log2 p : R. van den Boomgaard, lu par Grok) ----------
// Lettres tirees independamment selon les effectifs publies (modele d ordre 1, PAS l anglais reel avec ses mots). H = 4.181867014267 bits
//   par lettre (calcul de Grok). Exact ici : H par lnD ; un code de Huffman construit sur les 26 effectifs (fusion des deux plus rares,
//   repetee), longueur moyenne Lh. MESURE : H <= Lh < H + 1 (theoreme du codage de source) ; un texte tire (graine, longueur du curseur)
//   a une entropie empirique proche de H (ecart sous 0.05 bit des 5000 lettres).
// Temoin : un code de longueur FIXE a besoin de 5 bits par lettre (2^4 = 16 < 26) : bien plus que Lh, parce que les lettres ne sont
//   pas egalement frequentes.
// Dessin (vue de face) : chaque lettre (rang / 26, surprise -log2 de sa frequence dans le texte tire) ; etiquette = longueur de son code.
function entropieShannon(P, n) {
  const paires = SOURCES.lettresAnglais.valeur.split(' ').map((x) => { const [l, c] = x.split(':'); return [l, Number(c)]; }), tot = paires.reduce((a, [, c]) => a + c, 0);
  const lg2 = (x) => lnD(x) / lnD(2), H = -paires.reduce((a, [, c]) => a + (c / tot) * lg2(c / tot), 0);
  let foret = paires.map(([l, c]) => ({ poids: c, feuilles: [l] })); const longueur = Object.fromEntries(paires.map(([l]) => [l, 0]));
  while (foret.length > 1) { foret.sort((a, b) => a.poids - b.poids); const [a, b] = foret.splice(0, 2); for (const l of [...a.feuilles, ...b.feuilles]) longueur[l]++; foret.push({ poids: a.poids + b.poids, feuilles: [...a.feuilles, ...b.feuilles] }); }
  const Lh = paires.reduce((a, [l, c]) => a + (c / tot) * longueur[l], 0);
  const rng = mulberry32(P.graine), cumul = []; let acc = 0; for (const [, c] of paires) { acc += c; cumul.push(acc / tot); }
  const vus = new Array(26).fill(0); for (let i = 0; i < P.lettres; i++) { const u = rng(); let k = 0; while (cumul[k] < u) k++; vus[k]++; }
  const Hemp = -vus.reduce((a, v) => (v ? a + (v / P.lettres) * lg2(v / P.lettres) : a), 0);
  let fixe = 0; while (2 ** fixe < 26) fixe++;
  const ecarts = (H <= Lh && Lh < H + 1 ? 0 : 1) + (P.lettres >= 5000 && Math.abs(Hemp - H) > 0.05 ? 1 : 0);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const k = l % 26, o = 3 * l, p = (vus[k] || 0.5) / P.lettres; brut[o] = (k + 1) / 26; brut[o + 1] = -lg2(p); brut[o + 2] = longueur[paires[k][0]]; }
  return { D: 3, brut, nuage: true, unite: 'bits', invariants: {
    entropieShannon: { mesure: ecarts, formule: 0, entropie: H, longueurHuffman: Lh, entropieTexte: Hemp, totalLettres: tot, note: 'Huffman average length outside [H, H + 1), or a drawn text of 5000+ letters whose entropy is more than 0.05 bit from H' },
    temoin: { mesure: fixe, formule: Lh, note: 'witness: a fixed-length code needs 5 bits per letter (2^4 = 16 < 26), far more than Huffman, because the letters are not equally common' } } };
}

// ---------- 72 : l atmosphere standard US 1976 (idee et valeurs : codex Grok Bot 20 ; constantes : SOURCES, NASA SP-398 et C. D. Griffin) ----------
// Altitude GEOPOTENTIELLE H (m). 0-11 km : T = T0 + L H ; 11-20 km : isotherme. Equilibre hydrostatique dp/dH = -g0 M0 p / (R* T(H)).
// Exact ici : (1) la pression INTEGREE pas a pas (Runge-Kutta 4, 4000 pas par couche) ; (2) la formule fermee de chaque couche,
//   p = pb (T/Tb)^(-g0 M0 / (R* L)) puis p = p11 e^(-g0 M0 (H - 11000) / (R* T11)), par lnD et expPosD. MESURE : ecart relatif entre
//   les deux sous 1e-9 a chaque point. H = 0, 5, 11, 20 km : T et p = calculs de Grok (accord avec le tableau SP-398 a l arrondi).
// Temoin : 5 km GEOMETRIQUES ne sont pas 5 km geopotentiels : H = r0 z / (r0 + z) = 4996.07 m, T = 255.6755 K au lieu de 255.65 K.
// Dessin (vue de face) : (H / Hmax, p / p0) ; etiquette = temperature (K).
function atmosphereStandard(P, n) {
  const T0 = SOURCES.T0atm.valeur, p0 = SOURCES.p0atm.valeur, L = SOURCES.gradientAtm.valeur, g0 = SOURCES.g0atm.valeur, M0 = SOURCES.M0atm.valeur, Rs = SOURCES.RstarAtm.valeur, r0 = SOURCES.r0atm.valeur;
  const k = g0 * M0 / Rs, Hmax = P.altitudeKm * 1000, T11 = T0 + L * 11000, expAtm = (x) => (x >= 0 ? expPosD(x) : 1 / expPosD(-x));
  const Tde = (H) => (H <= 11000 ? T0 + L * H : T11), p11 = p0 * expAtm((-k / L) * lnD(T11 / T0));
  const pFerme = (H) => (H <= 11000 ? p0 * expAtm((-k / L) * lnD(Tde(H) / T0)) : p11 * expAtm(-k * (H - 11000) / T11));
  const f = (H, p) => -k * p / Tde(H); const pts = []; let p = p0, H = 0, ecarts = 0; const pasRK = Math.min(11000, Hmax) / 4000;
  const avance = (h, nb) => { for (let i = 0; i < nb; i++) { const a = f(H, p), b = f(H + h / 2, p + h * a / 2), c = f(H + h / 2, p + h * b / 2), d = f(H + h, p + h * c); p += h * (a + 2 * b + 2 * c + d) / 6; H += h;
    if (i % 20 === 0) { const pf = pFerme(H); if (Math.abs(p - pf) / pf > 1e-9) ecarts++; pts.push([H, p, Tde(H)]); } } };
  pts.push([0, p0, T0]); avance(pasRK, Math.round(Math.min(11000, Hmax) / pasRK)); if (Hmax > 11000) avance((Hmax - 11000) / 4000, 4000);
  const quatre = [0, 5000, 11000, 20000].map((x) => Tde(x).toFixed(3) + '/' + pFerme(x).toFixed(6)).join(' ');
  const zGeo = 5000, Hgeo = r0 * zGeo / (r0 + zGeo);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [h, pp, t] = pts[Math.floor(l * pts.length / n)], o = 3 * l; brut[o] = h / Hmax; brut[o + 1] = pp / p0; brut[o + 2] = t; }
  return { D: 3, brut, nuage: true, unite: 'Pa', invariants: {
    atmosphereStandard: { mesure: ecarts, formule: 0, quatreAltitudes: quatre, pression11: p11, note: 'points where the integrated pressure is more than 1e-9 (relative) from the closed formula of its layer' },
    temoin: { mesure: Tde(Hgeo), formule: Tde(5000), Hgeopotentiel: Hgeo, note: 'witness: 5 km GEOMETRIC is only 4996.07 m geopotential: the temperature there is 255.6755 K, not the 255.65 K of H = 5 km' } } };
}

// ---------- 73 : la loi de Zipf sur un vrai corpus (idee et valeurs : codex Grok Bot 20 ; comptes : SOURCES, P. Norvig / Google Web 1T) ----------
// Les mots les plus frequents : compte(r) ~ C / r^s. Exact ici : droite des moindres carres de log10(compte) contre log10(rang) sur les R
//   premiers rangs (R du curseur), pente -s. MESURE : comptes strictement decroissants ; pour R = 30, pente = -0.852706154 (calcul de Grok).
//   L exposant DECRIT ce corpus filtre, ce n est pas une constante universelle.
// Temoin : la pente depend des rangs choisis : sur les 10 premiers rangs elle n est pas celle des 30 premiers, et aucune ne vaut -1.
// Dessin (vue de face) : (log10 rang / log10 30, log10 compte relatif au premier) ; etiquette = ecart a la droite ajustee (residu).
function loiZipf(P, n) {
  const mots = SOURCES.motsWeb.valeur.split(' ').map((x) => { const [m, c] = x.split(':'); return [m, Number(c)]; }), lg10 = (x) => lnD(x) / lnD(10);
  const pente = (R) => { let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let r = 1; r <= R; r++) { const x = lg10(r), y = lg10(mots[r - 1][1]); sx += x; sy += y; sxx += x * x; sxy += x * y; } const b = (R * sxy - sx * sy) / (R * sxx - sx * sx); return [b, (sy - b * sx) / R]; };
  let nonDecroissant = 0; for (let r = 1; r < mots.length; r++) if (!(mots[r][1] < mots[r - 1][1])) nonDecroissant++;
  const R = P.rangsZipf, [b, a] = pente(R), [b10] = pente(10), [b30] = pente(30);
  const pts = mots.slice(0, R).map(([, c], i) => { const x = lg10(i + 1), y = lg10(c); return [x / lg10(30), y - lg10(mots[0][1]), y - (a + b * x)]; });
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [zx, zy, zr] = pts[l % pts.length], o = 3 * l; brut[o] = zx; brut[o + 1] = zy; brut[o + 2] = zr; }
  return { D: 3, brut, nuage: true, unite: 'log10', invariants: {
    loiZipf: { mesure: nonDecroissant, formule: 0, penteR: b, pente30: b30, sommeTrente: mots.reduce((s, [, c]) => s + c, 0), note: 'published counts that are not strictly decreasing with rank' },
    temoin: { mesure: b10, formule: b30, note: 'witness: the slope fitted on the top 10 words differs from the slope on the top 30, and neither is the classic -1: the exponent describes this corpus, it is not a constant' } } };
}

// ---------- 74 : la loi de Gutenberg-Richter (idee et valeurs : codex Grok Bot 20 ; b de Californie et catalogue mondial 2024 : SOURCES) ----------
// log10 N(>= M) = a - b M. Exact ici : des seismes TIRES (graine) selon la loi au b du curseur, magnitudes continues au-dessus de 4.5
//   (exponentielle de taux b ln 10) ; b RE-ESTIME par la formule d Aki b = log10(e) / (moyenne - 4.5). MESURE : l estimation tombe a moins de
//   4 ecarts-types (b / racine(N)) du b tire. Catalogue reel : les classes somment a 6397 (compte de Grok) et N(>=) decroit.
// Temoin : le catalogue MONDIAL 2024 tombe plus vite que la loi au b de Californie : N(>= 5.5) / N(>= 4.5) = 344/6397, loin de 10^-1.03 :
//   un b se mesure par region et par catalogue (et ce catalogue melange plusieurs echelles de magnitude), ce n est pas une constante.
// Dessin (vue de face) : seismes tires, (magnitude - 4.5, log10 du nombre de seismes au moins aussi forts) ; etiquette = classe de 0.5.
function gutenbergRichter(P, n) {
  const classes = SOURCES.comcat2024.valeur.split(' ').map((x) => x.split(':').map(Number)), total = classes.reduce((s, [, c]) => s + c, 0);
  const cumul = classes.map((_, i) => classes.slice(i).reduce((s, [, c]) => s + c, 0)); let nonDecroissant = 0; for (let i = 1; i < cumul.length; i++) if (cumul[i] > cumul[i - 1]) nonDecroissant++;
  const lg10 = (x) => lnD(x) / lnD(10), rng = mulberry32(P.graine), Nev = P.seismes, beta = P.bValeur * lnD(10), mags = [];
  for (let i = 0; i < Nev; i++) mags.push(4.5 - lnD(1 - rng()) / beta);
  const moyenne = mags.reduce((a, b) => a + b, 0) / Nev, bAki = lg10(expPosD(1)) / (moyenne - 4.5), sigma = P.bValeur / Math.sqrt(Nev);
  const ecarts = (Math.abs(bAki - P.bValeur) < 4 * sigma ? 0 : 1) + (total === 6397 ? 0 : 1) + nonDecroissant;
  mags.sort((a, b) => b - a); const pts = mags.map((m, i) => [m - 4.5, lg10(i + 1), Math.floor((m - 4.5) * 2)]);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [gm, gn, gc] = pts[Math.floor(l * pts.length / n)], o = 3 * l; brut[o] = gm; brut[o + 1] = gn; brut[o + 2] = gc; }
  const rapportReel = cumul[2] / cumul[0], rapportLoi = 1 / expPosD(SOURCES.bCalifornie.valeur * lnD(10));
  return { D: 3, brut, nuage: true, unite: 'magnitude', invariants: {
    gutenbergRichter: { mesure: ecarts, formule: 0, bEstime: bAki, sigma, totalCatalogue: total, cumulCatalogue: cumul.join(' '), note: 'drawn quakes whose re-estimated b is more than 4 standard errors off, a catalogue that does not add up to 6397, or cumulative counts that go up' },
    temoin: { mesure: rapportReel, formule: rapportLoi, note: 'witness: the 2024 world catalogue drops from M 4.5 to M 5.5 by 344/6397, far steeper than the Californian b = 1.03 would give: b belongs to a region and a catalogue' } } };
}

// ---------- 75 : la maree, vives-eaux et mortes-eaux (idee : codex 21, sous-agent Claude ; constantes NOAA de Providence : SOURCES) ----------
// Hauteur h(t) = A_M2 cos(w_M2 t - phi_M2) + r A_S2 cos(w_S2 t - phi_S2), t en heures, r = coefficient du curseur sur S2 (1 = Providence).
//   Exact ici : h echantillonnee toutes les 3 minutes sur la duree du curseur ; pleines mers TROUVEES (maxima locaux), amplitude de chaque
//   pleine mer relevee. MESURE : (1) retard moyen d une pleine mer a la suivante du meme rang = 2 x 360 / w_M2 - 24 h, soit environ 50 min par
//   jour, a 2 min pres ; (2) les plus fortes pleines mers (vives-eaux) reviennent tous les 360 / (w_S2 - w_M2) h = 14.77 jours, a 1 jour pres ;
//   (3) rapport vives-eaux / mortes-eaux = (A_M2 + r A_S2) / (A_M2 - r A_S2) a 2 % pres.
// Temoin : la maree lunaire seule (S2 coupe) a ses pleines mers toutes egales : aucun cycle de vives-eaux ; et sa periode est 12.42 h, pas 12 h.
// Dessin (vue de face) : (t / duree, h / (A_M2 + A_S2)) ; etiquette = jour.
function mareeVivesEaux(P, n) {
  const wM = SOURCES.vitesseM2.valeur * Math.PI / 180, wS = SOURCES.vitesseS2.valeur * Math.PI / 180, aM = SOURCES.amplitudeM2.valeur, aS = SOURCES.amplitudeS2.valeur * P.partS2;
  const pM = SOURCES.phaseM2.valeur * Math.PI / 180, pS = SOURCES.phaseS2.valeur * Math.PI / 180, Hh = P.jours * 24, dtM = 0.05;
  const h = (t, avecS2) => aM * cosD(wM * t - pM) + (avecS2 ? aS * cosD(wS * t - pS) : 0);
  const pleines = (avecS2) => { const out = []; let a = h(-dtM, avecS2), b = h(0, avecS2); for (let t = dtM; t <= Hh; t += dtM) { const c = h(t, avecS2); if (b > a && b >= c) out.push([t - dtM, b]); a = b; b = c; } return out; };
  const pm = pleines(true), periodeM2 = 360 / SOURCES.vitesseM2.valeur, retardTheo = (2 * periodeM2 - 24) * 60, battementJ = 360 / (SOURCES.vitesseS2.valeur - SOURCES.vitesseM2.valeur) / 24;
  const retards = []; for (let i = 2; i < pm.length; i++) retards.push((pm[i][0] - pm[i - 2][0] - 24) * 60); const retardMesure = retards.reduce((s, x) => s + x, 0) / retards.length;
  const vives = []; for (let i = 1; i + 1 < pm.length; i++) if (pm[i][1] >= pm[i - 1][1] && pm[i][1] >= pm[i + 1][1]) vives.push(pm[i][0]);
  const ecartsV = []; for (let i = 1; i < vives.length; i++) ecartsV.push((vives[i] - vives[i - 1]) / 24); const battementMesure = ecartsV.length ? ecartsV.reduce((s, x) => s + x, 0) / ecartsV.length : NaN;
  const hautes = pm.map((x) => x[1]), rapportMesure = Math.max(...hautes) / Math.min(...hautes), rapportTheo = (aM + aS) / (aM - aS);
  const ecarts = (Math.abs(retardMesure - retardTheo) < 2 ? 0 : 1) + (Number.isFinite(battementMesure) && Math.abs(battementMesure - battementJ) < 1 ? 0 : 1) + (Math.abs(rapportMesure / rapportTheo - 1) < 0.02 ? 0 : 1);
  const seulM2 = pleines(false).map((x) => x[1]), rapportSeul = Math.max(...seulM2) / Math.min(...seulM2);
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const t = Hh * l / (n - 1), o = 3 * l; brut[o] = t / Hh; brut[o + 1] = h(t, true) / (aM + SOURCES.amplitudeS2.valeur); brut[o + 2] = Math.floor(t / 24); }
  return { D: 3, brut, nuage: true, unite: 'm', invariants: {
    mareeVivesEaux: { mesure: ecarts, formule: 0, periodeM2Heures: periodeM2, retardMinutes: retardMesure, retardTheoMinutes: retardTheo, vivesEauxJours: battementMesure, vivesEauxTheoJours: battementJ, rapportVivesMortes: rapportMesure,
      note: 'daily delay of high water off by more than 2 min, spring tides not every 14.77 days (1 day tolerance), or spring/neap ratio off by more than 2 percent' },
    temoin: { mesure: rapportSeul, formule: 1, note: 'witness: with the lunar wave M2 alone every high water is equally high: no spring and neap tides; and its period is 12.42 h, not 12 h' } } };
}

// ---------- 76 : l energie de liaison des noyaux (idee : codex 21, sous-agent Claude ; B/A : SOURCES, AME2020 relu) ----------
// B/A = energie qu il faut, par nucleon, pour defaire le noyau. Energie TOTALE B = A x B/A. Une reaction libere Q = somme des B des produits
//   moins somme des B des reactifs. Exact ici : Q de D + D -> He4, de 3 He4 -> C12 (triple alpha) et de C12 + He4 -> O16, depuis les B/A
//   mesures. MESURE : les trois Q sont positifs (fusions de noyaux legers) ; la reaction du curseur est dessinee ; U238, lourd, est MOINS
//   lie par nucleon que Fe56 (d ou l energie de la fission).
// Temoin : on dit souvent que Fe56 est le noyau le plus lie ; les mesures placent Ni62 (puis Fe58) devant lui.
// Dessin (vue de face) : chaque noyau (A / 238, B/A / B/A maximal) ; etiquette = 1 s il prend part a la reaction du curseur.
function energieLiaison(P, n) {
  const noyaux = SOURCES.liaisonAME2020.valeur.split(' ').map((x) => { const [nom, A, ba] = x.split(':'); return { nom, A: Number(A), ba: Number(ba) }; });
  const parNom = Object.fromEntries(noyaux.map((x) => [x.nom, x])), Btot = (nom) => parNom[nom].A * parNom[nom].ba;
  const REACTIONS = [[['H2', 'H2'], ['He4']], [['He4', 'He4', 'He4'], ['C12']], [['C12', 'He4'], ['O16']]];
  const Q = REACTIONS.map(([r, p]) => p.reduce((s, x) => s + Btot(x), 0) - r.reduce((s, x) => s + Btot(x), 0));
  const plusLie = noyaux.reduce((a, b) => (b.ba > a.ba ? b : a));
  const ecarts = Q.filter((q) => !(q > 0)).length + (parNom.U238.ba < parNom.Fe56.ba ? 0 : 1);
  const [reac, prod] = REACTIONS[P.reaction], dedans = new Set([...reac, ...prod]), baMax = plusLie.ba;
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const x = noyaux[l % noyaux.length], o = 3 * l; brut[o] = x.A / 238; brut[o + 1] = x.ba / baMax; brut[o + 2] = dedans.has(x.nom) ? 1 : 0; }
  return { D: 3, brut, nuage: true, unite: 'keV', invariants: {
    energieLiaison: { mesure: ecarts, formule: 0, QkeV: Q.map((q) => q.toFixed(4)).join(' '), plusLie: plusLie.nom, reactionChoisie: reac.join(' + ') + ' -> ' + prod.join(' + '), note: 'fusions of light nuclei that would not release energy, or uranium-238 not less bound per nucleon than iron-56' },
    temoin: { mesure: parNom.Ni62.ba - parNom.Fe56.ba, formule: 0, note: 'witness: iron-56 is often called the most tightly bound nucleus, yet nickel-62 (and iron-58) bind more per nucleon' } } };
}

// ---------- 77 : la courbe de Keeling (idee : codex 22, sous-agent Claude ; moyennes annuelles NOAA de Mauna Loa : SOURCES) ----------
// Le CO2 de l air mesure a Mauna Loa (Hawaii) depuis 1959, moyenne de chaque annee. MESURE : sur la fenetre d annees du curseur, la
//   concentration monte CHAQUE annee ; sur la serie ENTIERE, la hausse de 2015-2025 depasse celle de 1959-1969 (0.864 -> 2.634 ppm/an).
//   PAS sur toute fenetre : 1990-2000 monte moins vite que 1980-1990 (1.526 contre 1.569) ; les hausses de la fenetre sont AFFICHEES.
// Temoin : une droite ajustee sur 1959-1969 et prolongee jusqu a 2025 donne 368.8 ppm ; la mesure est 427.35 : la hausse n est pas lineaire.
// Fenetre : au moins 10 ans (debut ramene a fin - 10 si besoin).
// Dessin (vue de face) : (annee - debut) / (fin - debut), (CO2 - 300) / 150 ; etiquette = hausse sur l annee (ppm).
function courbeKeeling(P, n) {
  const serie = SOURCES.co2MaunaLoa.valeur.split(' ').map((x) => x.split(':').map(Number)), deb = Math.min(P.anDebut, P.anFin - 10), choix = serie.filter(([an]) => an >= deb && an <= P.anFin);
  let baisses = 0; for (let i = 1; i < choix.length; i++) if (!(choix[i][1] > choix[i - 1][1])) baisses++;
  const hausse = (a, b) => (choix[b][1] - choix[a][1]) / (b - a), m = choix.length - 1, k = Math.min(10, Math.floor(m / 2));
  const debutH = hausse(0, k), finH = hausse(m - k, m), hausseSerie = (a, b) => (serie[b][1] - serie[a][1]) / (b - a), nS = serie.length - 1;
  const ecarts = baisses + (hausseSerie(nS - 10, nS) > hausseSerie(0, 10) ? 0 : 1);
  let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = 0; i <= 10; i++) { sx += serie[i][0]; sy += serie[i][1]; sxx += serie[i][0] * serie[i][0]; sxy += serie[i][0] * serie[i][1]; }
  const pente = (11 * sxy - sx * sy) / (11 * sxx - sx * sx), origine = (sy - pente * sx) / 11, dernier = serie[serie.length - 1], prolonge = origine + pente * dernier[0];
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const i = Math.floor(l * choix.length / n), [an, ppm] = choix[i], o = 3 * l; brut[o] = (an - deb) / (P.anFin - deb); brut[o + 1] = (ppm - 300) / 150; brut[o + 2] = i ? ppm - choix[i - 1][1] : 0; }
  return { D: 3, brut, nuage: true, unite: 'ppm', invariants: {
    courbeKeeling: { mesure: ecarts, formule: 0, annees: serie.length, premiere: serie[0].join(':'), derniere: dernier.join(':'), hausseDebut: debutH, hausseFin: finH, note: 'years in the chosen window where CO2 did not rise, or a whole record (1959-2025) whose last decade does not rise faster than its first; the window rises are shown, not judged (the 1990s rose more slowly than the 1980s)' },
    temoin: { mesure: prolonge, formule: dernier[1], note: 'witness: a straight line fitted on 1959-1969 and extended to 2025 gives about 368.8 ppm, against 427.35 measured: the rise is not linear' } } };
}

// ---------- 78 : la population mondiale (idee : codex 22, sous-agent Claude ; ONU WPP 2024 : SOURCES) ----------
// Population du monde tous les 10 ans de 1950 a 2020. Taux de croissance annuel moyen de chaque decennie r = ln(P2/P1) / 10.
// MESURE : la population monte a chaque decennie ; le taux culmine en 1960-1970 (2.03 %/an) puis BAISSE a chaque decennie (1.16 %/an en
//   2010-2020). Une exponentielle ajustee (moindres carres sur ln P) sur les k premieres decennies du curseur est prolongee jusqu a 2020.
// Temoin : ajustee sur 1950-1970, l exponentielle donne 9.86 milliards en 2020 contre 7.89 mesures : la croissance a ralenti.
// Dessin (vue de face) : (annee - 1950) / 70, population / 8 milliards ; etiquette = 0 mesure ONU, 1 exponentielle ajustee.
function populationMonde(P, n) {
  const pts = SOURCES.populationONU.valeur.split(' ').map((x) => x.split(':').map(Number)), taux = [];
  for (let i = 1; i < pts.length; i++) taux.push(lnD(pts[i][1] / pts[i - 1][1]) / 10);
  let baisses = 0; for (let i = 1; i < pts.length; i++) if (!(pts[i][1] > pts[i - 1][1])) baisses++;
  const pic = taux.indexOf(Math.max(...taux)); let remontees = 0; for (let i = pic + 1; i < taux.length; i++) if (!(taux[i] < taux[i - 1])) remontees++;
  const ajuste = (k) => { let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = 0; i <= k; i++) { const x = pts[i][0] - 1950, y = lnD(pts[i][1]); sx += x; sy += y; sxx += x * x; sxy += x * y; } const m = k + 1, b = (m * sxy - sx * sy) / (m * sxx - sx * sx); return [(sy - b * sx) / m, b]; };
  const [a, b] = ajuste(P.decennies), expo = (an) => expPosD(a + b * (an - 1950)), [a2, b2] = ajuste(2), prolonge2020 = expPosD(a2 + b2 * 70);
  const ecarts = baisses + remontees + (pic === 1 ? 0 : 1), courbe = [];
  for (let an = 1950; an <= 2020; an += 1) courbe.push([an, expo(an), 1]);
  const tout = [...pts.map(([an, p]) => [an, p, 0]), ...courbe], brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [an, p, e] = tout[l % tout.length], o = 3 * l; brut[o] = (an - 1950) / 70; brut[o + 1] = p / 8e6; brut[o + 2] = e; }
  return { D: 3, brut, nuage: true, unite: 'milliers', invariants: {
    populationMonde: { mesure: ecarts, formule: 0, tauxParDecennie: taux.map((r) => (100 * r).toFixed(4)).join(' '), decenniePic: (1950 + 10 * pic) + '-' + (1960 + 10 * pic), expo2020: expo(2020), note: 'decades where population did not grow, a peak growth decade other than 1960-1970, or growth rates that rise again after the peak' },
    temoin: { mesure: prolonge2020, formule: pts[pts.length - 1][1], note: 'witness: an exponential fitted on 1950-1970 and extended to 2020 gives about 9.86 billion, against 7.89 billion counted: growth slowed down' } } };
}

// ---------- 79 : l effet photoelectrique (idee et valeurs : codex Grok Bot 20 ; h, e, c et travaux de sortie : SOURCES) ----------
// Un photon d energie h nu arrache un electron si h nu >= phi ; energie cinetique maximale K = h nu - phi, tension d arret Vs = K / e.
// Exact ici : h/e et hc/e CALCULES depuis les constantes exactes (hc/e = 1239.841984 eV nm) ; pour chacun des quatre metaux, Vs mesuree
//   sur un balayage de frequences (au-dessus du seuil) puis droite des moindres carres : la PENTE vaut h/e pour TOUS les metaux (le trace
//   de Millikan), l ordonnee a l origine -phi/e. Ag(100) a 200 nm : K = 1.559209922 eV (calcul de Grok).
// Temoin : a 300 nm, l argent n emet RIEN (photon de 4.1328 eV < 4.64 eV), quelle que soit l intensite : l image classique d une onde qui
//   finit par arracher l electron est fausse.
// Dessin (vue de face) : droites de Millikan des quatre metaux (frequence / 2e15 Hz, Vs / 5 V) ; etiquette = metal (0 Ag, 1 Cu, 2 Ir, 3 Ta) ;
//   le metal du curseur porte en plus le point de la longueur d onde choisie.
function effetPhotoelectrique(P, n) {
  const h = SOURCES.hPlanck.valeur, e = SOURCES.eCharge.valeur, c = SOURCES.cLumiere.valeur, hE = h / e, hcE = h * c / e * 1e9;
  const metaux = SOURCES.travauxSortie.valeur.split(' ').map((x) => { const [nom, p] = x.split(':'); return [nom, Number(p)]; });
  const pentes = [], pts = []; let ecarts = 0;
  metaux.forEach(([, phi], j) => { const nu0 = phi / hE; let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
    for (let k = 0; k <= 40; k++) { const nu = nu0 * (1 + k / 20), vs = hE * nu - phi; sx += nu; sy += vs; sxx += nu * nu; sxy += nu * vs; m++; pts.push([nu / 2e15, vs / 5, j]); }
    const b = (m * sxy - sx * sy) / (m * sxx - sx * sx), a = (sy - b * sx) / m; pentes.push(b); if (Math.abs(b / hE - 1) > 1e-9 || Math.abs(a + phi) > 1e-9 * phi) ecarts++; });
  const [nomC, phiC] = metaux[P.metal], Eg = hcE / P.lambdaNm, K = Eg - phiC;
  for (let k = 0; k < 20; k++) pts.push([(c / (P.lambdaNm * 1e-9)) / 2e15, (K > 0 ? K : 0) / 5, P.metal]);
  const ag = metaux.find((x) => x[0] === 'Ag')[1], K200 = hcE / 200 - ag, E300 = hcE / 300;
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'eV', invariants: {
    effetPhotoelectrique: { mesure: ecarts, formule: 0, hSurE: hE, hcSurENm: hcE, seuilNm: metaux.map(([nm, p]) => nm + ':' + (hcE / p).toFixed(6)).join(' '), K200Ag: K200, metalChoisi: nomC, KchoisiEv: K,
      note: 'metals whose stopping-voltage line does not have slope h/e and intercept -phi/e (Millikan plot)' },
    temoin: { mesure: E300 > ag ? E300 - ag : 0, formule: 0, photon300: E300, note: 'witness: at 300 nm silver emits nothing (4.1328 eV photons, 4.64 eV work function), however bright the light: a wave would not behave like that' } } };
}

// ---------- 80 : six demi-vies publiees (idee : codex Grok Bot 20 ; demi-vies et incertitudes : SOURCES, NPL IR 6) ----------
// Une population d atomes instables decroit en N(t) = N0 exp(-lambda t), lambda = ln 2 / T. Exact ici : lambda et son incertitude
//   u(lambda) = lambda u(T) / T pour chacun des six ; MESURE : il reste exactement 1/2 a T et 1/8 a 3 T (a 1e-12 pres) pour tous.
// Datation au carbone 14 : un echantillon qui garde 1/8 de son 14C a 3 demi-vies, 3 x 2 082 000 / 365.242198 = 17101 ans, +- 90 ans
//   (l incertitude publiee, triplee) : l age porte l incertitude de la demi-vie, pas plus fine.
// Temoin : une decroissance LINEAIRE (meme pente initiale) ne laisserait plus rien apres 1 / ln 2 = 1.44 demi-vie ; la vraie loi laisse
//   encore 1/4 a deux demi-vies.
// Dessin (vue de face) : fraction restante contre log10 du temps (jours, de 0.1 jour a 10^8), une courbe par isotope (etiquette 0 a 5) ;
//   l isotope du curseur est redessine en temps lineaire jusqu a demiVies demi-vies (etiquette 6).
function demiViesNPL(P, n) {
  const LN2 = lnD(2), an = SOURCES.anneeNPL.valeur;
  const iso = SOURCES.demiViesNPL.valeur.split(' ').map((x) => { const [nom, T, u] = x.split(':'); return [nom, Number(T), Number(u)]; });
  const resteA = (lam, t) => 1 / expPosD(lam * t), LN10 = lnD(10), dixPuissance = (lt) => (lt >= 0 ? expPosD(lt * LN10) : 1 / expPosD(-lt * LN10));
  let ecarts = 0; const lambdas = [], pts = [];
  iso.forEach(([, T, u], j) => { const lam = LN2 / T; lambdas.push([lam, lam * u / T]);
    if (Math.abs(resteA(lam, T) - 0.5) > 1e-12 || Math.abs(resteA(lam, 3 * T) - 0.125) > 1e-12) ecarts++;
    for (let k = 0; k < 60; k++) { const lt = -1 + 9 * k / 59; pts.push([lt / 8, resteA(lam, dixPuissance(lt)), j]); } });
  const [nomC, Tc] = iso[P.isotope];
  for (let k = 1; k <= 60; k++) { const t = Tc * P.demiVies * k / 60; pts.push([lnD(t) / LN10 / 8, resteA(LN2 / Tc, t), 6]); }
  const c14 = iso.find((x) => x[0] === 'C14'), age = 3 * c14[1] / an, uAge = 3 * c14[2] / an;
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'days', invariants: {
    demiViesNPL: { mesure: ecarts, formule: 0, lambdasParJour: iso.map(([nm], j) => nm + ':' + lambdas[j][0].toPrecision(9) + '+-' + lambdas[j][1].toPrecision(3)).join(' '),
      isotopeChoisi: nomC, resteChoisi: resteA(LN2 / Tc, Tc * P.demiVies), ageTroisDemiViesC14: age, incertitudeAgeC14: uAge,
      note: 'isotopes not leaving exactly 1/2 after one half-life and 1/8 after three' },
    temoin: { mesure: Math.abs(resteA(LN2, 2) - 0.25), formule: 0, lineaireVideApres: 1 / LN2, note: 'witness: a straight-line decay with the same starting slope is empty after 1.44 half-lives; the real law still leaves a quarter after two' } } };
}

// ---------- 81 : le cholera de John Snow, 1854 (idee : codex 23, sous-agent Claude ; tables : SOURCES, Snow 1855) ----------
// Les memes rues de Londres etaient servies par deux compagnies d eau : Southwark and Vauxhall (puisait dans la Tamise sous les egouts) et
//   Lambeth (puisait en amont). Exact ici : deces pour 10 000 maisons RECALCULES depuis les comptes de Snow, et leur rapport :
//   1263 / 40046 contre 98 / 26107 -> 315.39 contre 37.54, 8.40 fois (Snow : « between eight and nine times ») ; sept semaines suivantes
//   2353 / 40046 contre 302 / 26107 -> 587.57 contre 115.68, 5.08 fois (Snow : « nearly five times »).
// MESURE : le rapport recalcule tombe dans la fourchette que Snow ecrit (8 a 9 ; 4.5 a 5.5). Les taux imprimes sont des troncatures, sauf
//   DEUX qui ne se recalculent pas et que le module nomme : « Rest of London 59 » (1422 / 256423 = 55.46) et « 537 » (= 587.57).
// Temoin : compter les deces sans les maisons donne 1263 / 98 = 12.9 fois : 53 % de trop, parce que Southwark and Vauxhall servait plus
//   de maisons. Le denominateur fait la preuve.
// Dessin (vue de face) : un echantillon de maisons melangees dans les memes rues (graine), etiquette 0 S&V, 1 deces S&V, 2 Lambeth,
//   3 deces Lambeth, au taux de la periode choisie (septSemaines 1 ou 2).
function choleraSnow(P, n) {
  const lire = (src) => src.split(' ').map((x) => { const [nom, m, d, imp] = x.split(':'); return { nom, maisons: Number(m), deces: Number(d), imprime: Number(imp), taux: Number(d) / Number(m) * 1e4 }; });
  const t9 = lire(SOURCES.snowTableIX.valeur), t10 = lire(SOURCES.snowSeptSuivantes.valeur);
  const rr1 = t9[0].taux / t9[1].taux, rr2 = t10[0].taux / t10[1].taux;
  let ecarts = 0; if (rr1 < 8 || rr1 > 9) ecarts++; if (rr2 < 4.5 || rr2 > 5.5) ecarts++;
  const coquilles = [...t9, ...t10.map((x) => ({ ...x, nom: x.nom + 'Weeks8to14' }))].filter((x) => Math.floor(x.taux) !== x.imprime).map((x) => x.nom + ' ' + x.imprime + ' vs ' + x.taux.toFixed(2));
  const periode = P.septSemaines === 2 ? t10 : t9, pSV = periode[0].taux / 1e4, pL = periode[1].taux / 1e4, partSV = t9[0].maisons / (t9[0].maisons + t9[1].maisons);
  const alea = mulberry32(0x5a0 + 7919 * P.graine), brut = new Float64Array(n * 3);
  let svN = 0, svD = 0, lN = 0, lD = 0;
  for (let l = 0; l < n; l++) { const o = 3 * l, sv = alea() < partSV, mort = alea() < (sv ? pSV : pL);
    brut[o] = alea(); brut[o + 1] = alea(); brut[o + 2] = sv ? (mort ? 1 : 0) : (mort ? 3 : 2);
    if (sv) { svN++; if (mort) svD++; } else { lN++; if (mort) lD++; } }
  const naif = t9[0].deces / t9[1].deces;
  return { D: 3, brut, nuage: true, unite: 'deaths per 10,000 houses', invariants: {
    choleraSnow: { mesure: ecarts, formule: 0, tauxPour10000: t9.map((x) => x.nom + ':' + x.taux.toFixed(2)).join(' '), rapportRisque: rr1, rapportDeuxiemePeriode: rr2, coquilles: coquilles.join(' ; '),
      echantillonSV: svN + ' houses, ' + svD + ' deaths', echantillonLambeth: lN + ' houses, ' + lD + ' deaths',
      note: 'recomputed ratios outside the range Snow wrote (8 to 9 times, then nearly five)' },
    temoin: { mesure: naif > 1.5 * rr1 ? 0 : 1, formule: 0, rapportNaif: naif, note: 'witness: counting deaths without houses gives 12.9 times instead of 8.4, because Southwark and Vauxhall supplied more houses' } } };
}

// ---------- 82 : les raies de Balmer et la droite de Rydberg (idee : codex 23, sous-agent Claude ; raies et constantes : SOURCES, NIST) ----------
// L hydrogene excite emet des raies 2 <- n. Rydberg : 1/lambda = R (1/4 - 1/n^2) : 1/lambda est une DROITE en 1/n^2, de pente -R.
// Exact ici : la pente est AJUSTEE (moindres carres) sur les longueurs d onde MESUREES par le NIST (vide), de n = 3 a nPlusHaut, et comparee
//   a R_H = R_inf / (1 + me/mp) = 10 967 758.34 m^-1 (masse reduite : le noyau n est pas infini).
// MESURE : R ajuste a moins de 3e-5 de R_H, et Bohr avec R_H redonne chaque raie a moins de 0.01 nm (ecart 0.0064 nm sur H-alpha :
//   structure fine et decalage de Lamb, absents de la formule). Vide / air : 1.000276 a 1.000282 (indice de l air).
// Temoin : avec R_inf (noyau infini), H-alpha tombe a 656.1123 nm, 0.35 nm sous la mesure 656.4632 : la masse du proton se voit.
// Dessin (vue de face) : 1/n^2 (x 9) contre 1/lambda (/ (R_H / 4)) ; etiquette 0 raie mesuree, 1 droite de Rydberg ajustee.
function raiesBalmer(P, n) {
  const RH = SOURCES.rInfini.valeur / (1 + 1 / SOURCES.mpSurMe.valeur);
  const raies = SOURCES.balmerNIST.valeur.split(' ').map((x) => { const [k, v, a] = x.split(':').map(Number); return { n: k, vide: v, air: a }; });
  const pris = raies.filter((r) => r.n <= P.nPlusHaut);
  let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const r of pris) { const x = 1 / (r.n * r.n), y = 1e9 / r.vide; sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const m = pris.length, b = (m * sxy - sx * sy) / (m * sxx - sx * sx), a = (sy - b * sx) / m, Rfit = -b;
  const bohr = (R, k) => 1e9 / (R * (0.25 - 1 / (k * k)));
  const ecartsNm = raies.map((r) => bohr(RH, r.n) - r.vide), ecartMax = Math.max(...ecartsNm.map(Math.abs));
  let ecarts = 0; if (Math.abs(Rfit / RH - 1) > 3e-5) ecarts++; if (ecartMax > 0.01) ecarts++;
  const videAir = raies.map((r) => r.vide / r.air), halphaInf = bohr(SOURCES.rInfini.valeur, 3) - raies[0].vide;
  const pts = []; for (const r of pris) for (let k = 0; k < 12; k++) pts.push([9 / (r.n * r.n), 1e9 / r.vide / (RH / 4), 0]);
  for (let k = 0; k <= 60; k++) { const x = k / 60 / 4; pts.push([9 * x, (a + b * x) / (RH / 4), 1]); }
  const brut = new Float64Array(n * 3);
  for (let l = 0; l < n; l++) { const [px, py, pe] = pts[l % pts.length], o = 3 * l; brut[o] = px; brut[o + 1] = py; brut[o + 2] = pe; }
  return { D: 3, brut, nuage: true, unite: 'm^-1', invariants: {
    raiesBalmer: { mesure: ecarts, formule: 0, rydbergAjuste: Rfit, rapportRH: Rfit / RH, ordonneeSurQuart: a / (Rfit / 4), ecartBohrMaxNm: ecartMax,
      ecartsBohrNm: raies.map((r, j) => r.n + ':' + ecartsNm[j].toFixed(4)).join(' '), rapportVideAir: Math.min(...videAir).toFixed(6) + ' a ' + Math.max(...videAir).toFixed(6),
      note: 'fitted Rydberg constant more than 3e-5 from R_H, or a Bohr wavelength more than 0.01 nm from NIST' },
    temoin: { mesure: Math.abs(halphaInf) > 0.3 ? 0 : 1, formule: 0, ecartRInfiniHalpha: halphaInf, note: 'witness: with an infinitely heavy nucleus (R_inf) H-alpha lands 0.35 nm short of the measured line' } } };
}

export const COLONNES = Object.freeze({
  raiesBalmer: { colonnes: ['1 / n^2 (x 9)', '1 / wavelength (/ R_H / 4)', 'measured line or fitted Rydberg line (label)'], memeLongueur: [], autres: [0, 1, 2] },
  choleraSnow: { colonnes: ['street position x', 'street position y', 'house (0 S&V, 1 S&V death, 2 Lambeth, 3 Lambeth death) (label)'], memeLongueur: [], autres: [0, 1, 2] },
  demiViesNPL: { colonnes: ['log10 time in days / 8', 'share of atoms left', 'isotope (0 H-3, 1 Be-7, 2 C-14, 3 Co-60, 4 I-131, 5 Cs-137, 6 chosen)  (label)'], memeLongueur: [], autres: [0, 1, 2] },
  effetPhotoelectrique: { colonnes: ['light frequency / 2e15 Hz', 'stopping voltage / 5 V', 'metal (0 Ag, 1 Cu, 2 Ir, 3 Ta) (label)'], memeLongueur: [], autres: [0, 1, 2] },
  populationMonde: { colonnes: ['(year - 1950) / 70', 'world population / 8 billion', 'UN count 0, fitted exponential 1 (label)'], memeLongueur: [], autres: [0, 1, 2] },
  courbeKeeling: { colonnes: ['year within the window', '(CO2 - 300 ppm) / 150', 'rise during that year in ppm (label)'], memeLongueur: [], autres: [0, 1, 2] },
  energieLiaison: { colonnes: ['mass number A / 238', 'binding energy per nucleon / largest', 'takes part in the chosen reaction (label)'], memeLongueur: [], autres: [0, 1, 2] },
  mareeVivesEaux: { colonnes: ['time / duration', 'water height / (M2 + S2 amplitudes)', 'day (label)'], memeLongueur: [], autres: [0, 1, 2] },
  gutenbergRichter: { colonnes: ['magnitude above 4.5', 'log10 of the number of quakes at least that strong', 'half-magnitude class (label)'], memeLongueur: [], autres: [0, 1, 2] },
  loiZipf: { colonnes: ['log10 rank / log10 30', 'log10 count minus log10 count of "the"', 'gap to the fitted line (label)'], memeLongueur: [], autres: [0, 1, 2] },
  atmosphereStandard: { colonnes: ['geopotential height / top', 'pressure / sea-level pressure', 'temperature in K (label)'], memeLongueur: [], autres: [0, 1, 2] },
  entropieShannon: { colonnes: ['letter rank / 26 (E first)', 'surprise of the letter in the drawn text (bits)', 'length of its Huffman code (label)'], memeLongueur: [], autres: [0, 1, 2] },
  gammeTemperee: { colonnes: ['step k / N (one octave)', 'semitones away from the nearest simple ratio', 'step k (label)'], memeLongueur: [], autres: [0, 1, 2] },
  fourmiLangton: { colonnes: ['ant x', 'ant y', 'colour it left (label)'], memeLongueur: [[0, 1]], autres: [2] },
  suitePadovan: { colonnes: ['n / N', 'gap of the ratio to the plastic number (relative)', 'sign of the gap (label)'], memeLongueur: [], autres: [0, 1, 2] },
  thueMorse: { colonnes: ['turtle x', 'turtle y', 't(n) (label)'], memeLongueur: [[0, 1]], autres: [2] },
  suitePerrin: { colonnes: ['n / N', '(P(n) mod n) / n', 'prime (label)'], memeLongueur: [], autres: [0, 1, 2] },
  suiteKolakoski: { colonnes: ['k / N', 'excess of 1s over 2s so far (relative)', 'the term (label)'], memeLongueur: [], autres: [0, 1, 2] },
  suiteRecaman: { colonnes: ['n / N', 'a(n) / largest term', 'direction of the jump (label)'], memeLongueur: [], autres: [0, 1, 2] },
  triangleNarayana: { colonnes: ['k / (n + 1)', 'N(n, k) / largest in its row', 'row n (label)'], memeLongueur: [], autres: [0, 1, 2] },
  schroderChemins: { colonnes: ['x / 2n', 'height (relative)', 'kind of step (label)'], memeLongueur: [], autres: [0, 1, 2] },
  frobeniusPieces: { colonnes: ['coin a / Bmax', 'coin b / Bmax', 'impossible amounts (label)'], memeLongueur: [[0, 1]], autres: [2] },
  goldbachPaires: { colonnes: ['E / Emax', 'splits / most splits', 'E mod 3 (label)'], memeLongueur: [], autres: [0, 1, 2] },
  indicatriceEuler: { colonnes: ['n / N', 'phi(n) / n', 'distinct prime factors (label)'], memeLongueur: [], autres: [0, 1, 2] },
  periodePisano: { colonnes: ['m / M', 'period / longest period', 'zeros in one cycle (label)'], memeLongueur: [], autres: [0, 1, 2] },
  motzkinChemins: { colonnes: ['step / n', 'height (relative)', 'kind of step (label)'], memeLongueur: [], autres: [0, 1, 2] },
  stirlingBell: { colonnes: ['element / n', 'its block (relative)', 'blocks opened so far (label)'], memeLongueur: [], autres: [0, 1, 2] },
  routineKaprekar: { colonnes: ['start / 10^L', 'steps / most steps', 'distinct digits (label)'], memeLongueur: [], autres: [0, 1, 2] },
  suiteCollatz: { colonnes: ['start / N', 'flight / longest flight', 'odd steps 3n + 1 (label)'], memeLongueur: [], autres: [0, 1, 2] },
  nombresHarmoniques: { colonnes: ['n / N', 'H(n) - ln n', 'power of 2 in the denominator (label)'], memeLongueur: [], autres: [0, 1, 2] },
  derangements: { colonnes: ['object i', 'where it goes sigma(i)', 'how far it moves sigma(i) - i (label)'], memeLongueur: [[0, 1]], autres: [2] },
  regarderDire: { colonnes: ['term / terms', 'log length (relative)', 'distinct digits (label)'], memeLongueur: [], autres: [0, 1, 2] },
  toursHanoi: { colonnes: ['move / total', 'disk / n', 'target peg (label)'], memeLongueur: [], autres: [0, 1, 2] },
  calkinWilf: { colonnes: ['position in its level', '-level (scaled)', 'fraction above 1 (label)'], memeLongueur: [], autres: [0, 1, 2] },
  theoremeLucas: { colonnes: ['k - n/2 (across)', '-n (row, downwards)', 'binom(n, k) mod p (label)'], memeLongueur: [[0, 1]], autres: [2] },
  zeckendorf: { colonnes: ['which Fibonacci number (index)', 'n (downwards, scaled)', 'number of terms (label)'], memeLongueur: [], autres: [0, 1, 2] },
  problemeJosephus: { colonnes: ['x', 'y', 'order of elimination (label; the survivor is last)'], memeLongueur: [[0, 1]], autres: [2] },
  nombresBernoulli: { colonnes: ['n', 'log10 |B_n|', 'sign (label; 1 positive, 0 negative)'], memeLongueur: [], autres: [0, 1, 2] },
  parfaitsAmicaux: { colonnes: ['n / limit', 's(n) / n', 'kind (label; 2 perfect, 1 amicable, 0 other)'], memeLongueur: [], autres: [0, 1, 2] },
  fonctionMertens: { colonnes: ['n / limit', 'M(n) / sqrt(limit)', 'mu(n) + 1 (label)'], memeLongueur: [], autres: [0, 1, 2] },
  theoremeWilson: { colonnes: ['n / limit', '((n - 1)! mod n) / n', 'prime (label; 1 prime, 0 composite)'], memeLongueur: [], autres: [0, 1, 2] },
  nombresCarmichael: { colonnes: ['rank of the number found', 'prime factor p of it', 'kind (label; 0 = base-2 pseudoprime only, 1 = Carmichael)'], memeLongueur: [], autres: [0, 1, 2] },
  equationPell: { colonnes: ['k (convergent number)', 'p_k / q_k', 'sign of p^2 - D q^2 (label; 0 negative, 1 positive, 2 = root D)'], memeLongueur: [], autres: [0, 1, 2] },
  sommesCarres: { colonnes: ['a', 'b', 'a^2 + b^2 (label)'], memeLongueur: [[0, 1]], autres: [2] },
  ptolemee: { colonnes: ['x', 'y', 'what (label; 0 = circle, 1 = quadrilateral, 2 = diagonals)'], memeLongueur: [[0, 1]], autres: [2] },
  pascalHexagramme: { colonnes: ['x', 'y', 'what (label; 0 = circle, 1 = hexagon, 2 = extended sides and the Pascal line)'], memeLongueur: [[0, 1]], autres: [2] },
  ramseyR33: { colonnes: ['x', 'y', 'colour (label; 0 = red, 1 = blue, 2 = the one-colour triangle)'], memeLongueur: [[0, 1]], autres: [2] },
  triangulations: { colonnes: ['x', 'y', 'what (label; 0 = polygon, 1 = diagonals)'], memeLongueur: [[0, 1]], autres: [2] },
  distinctesImpaires: { colonnes: ['column', 'row (downwards)', 'which side (label; 0 = distinct parts, 1 = odd parts)'], memeLongueur: [[0, 1]], autres: [2] },
  simsonDroite: { colonnes: ['x', 'y', 'what (label; 0 = triangle, 1 = circle, 2 = perpendiculars, 3 = Simson line)'], memeLongueur: [[0, 1]], autres: [2] },
  bale: { colonnes: ['1/n', 'value', 'what (label; 0 = S_n, 1 = pi^2/6, 2 = the band 1/(n+1) .. 1/n under it)'], memeLongueur: [], autres: [0, 1, 2] },
  morley: { colonnes: ['x', 'y', 'what (label; 0 = triangle, 1 = trisectors, 2 = Morley triangle)'], memeLongueur: [[0, 1]], autres: [2] },
  eulerSolides: { colonnes: ['x', 'y', 'z (the edges of the solid)'], memeLongueur: [[0, 1, 2]], autres: [] },
  marcheAutoEvitante: { colonnes: ['x (lattice)', 'y (lattice)', 'step number (label)'], memeLongueur: [[0, 1]], autres: [2] },
  jeuDeLaVie: { colonnes: ['x (cells)', 'y (cells)', 'generation within the period (label)'], memeLongueur: [[0, 1]], autres: [2] },
  feuerbach: { colonnes: ['x', 'y', 'what (label; 0 = triangle, 1 = nine-point circle, 2 = incircle, 3 = excircles)'], memeLongueur: [[0, 1]], autres: [2] },
  billardElliptique: { colonnes: ['x', 'y', 'what (label; 0 = the table, 1 = the path, 2 = the caustic)'], memeLongueur: [[0, 1]], autres: [2] },
  napoleon: { colonnes: ['x', 'y', 'what (label; 0 = the triangle, 1 = equilateral triangles on its sides, 2 = Napoleon triangle)'], memeLongueur: [[0, 1]], autres: [2] },
  percolationLiens: { colonnes: ['x (lattice)', 'y (lattice)', 'cluster (label; 2 = crosses, 1 = touches the left side, 0 = other)'], memeLongueur: [[0, 1]], autres: [2] },
  theoremePick: { colonnes: ['x', 'y', 'what (label; 0 = the outline, 1 = whole point inside, 2 = whole point on the boundary)'], memeLongueur: [[0, 1]], autres: [2] },
  courbeDragon: { colonnes: ['x', 'y', 'fold that made the segment (label)'], memeLongueur: [[0, 1]], autres: [2] },
  partitionEuler: { colonnes: ['column', 'row (downwards)', 'row number (label)'], memeLongueur: [[0, 1]], autres: [2] },
  catalanDyck: { colonnes: ['step', 'height', 'path (label)'], memeLongueur: [], autres: [0, 1, 2] },
  ruineJoueur: { colonnes: ['bets played', 'fortune', 'game (label; 0 = the walls 0 and a)'], memeLongueur: [], autres: [0, 1, 2] },
  collectionneur: { colonnes: ['draws so far', 'different coupons owned', 'collection (label; 0 = the exact mean curve)'], memeLongueur: [], autres: [0, 1, 2] },
  aztecDiamond: { colonnes: ['x (cells)', 'y (cells)', 'arrow of the domino (label; 0 N, 1 S, 2 E, 3 W)'], memeLongueur: [[0, 1]], autres: [2] },
  ising: { colonnes: ['x (spin)', 'y (spin)', 'spin (label; +1 or -1)'], memeLongueur: [[0, 1]], autres: [2] },
  dominosKasteleyn: { colonnes: ['x (cells)', 'y (cells)', 'domino (label; 0 = lying, 1 = standing, 2 = cannot be tiled)'], memeLongueur: [[0, 1]], autres: [2] },
  papillonHofstadter: { colonnes: ['flux alpha = p/q', 'energy E', 'denominator q (label)'], memeLongueur: [], autres: [0, 1, 2] },
  causticTasse: { colonnes: ['x', 'y', 'what (label; 0 = the bright line found, 1 = the cup, 2 = reflected rays)'], memeLongueur: [[0, 1]], autres: [2] },
  fermatSteiner: { colonnes: ['x', 'y', 'network (label; 0 = shortest, 1 = the other shape)'], memeLongueur: [[0, 1]], autres: [2] },
  cerclesFord: { colonnes: ['x (the fraction p/q on the line)', 'y (height above the line)', 'denominator q (label)'], memeLongueur: [[0, 1]], autres: [2] },
  vergerEuclide: { colonnes: ['a (trees across)', 'b (trees up)', 'row max(a, b) (label)'], memeLongueur: [[0, 1]], autres: [2] },
  tasDeSable: { colonnes: ['x (cell)', 'y (cell)', 'grains on the cell (label, 0 to 3)'], memeLongueur: [[0, 1]], autres: [2] },
  apollonius: { colonnes: ['x', 'y', 'generation (label; -1 = the three starting circles)'], memeLongueur: [[0, 1]], autres: [2] },
  marcheAleatoire: { colonnes: ['x (grid steps)', 'y (grid steps)', 'step number'], memeLongueur: [[0, 1]], autres: [2] },
  aiguilleBuffon: { colonnes: ['x (floor widths)', 'y (floor widths; lines at whole numbers)', 'crosses a line (1) or not (0)'], memeLongueur: [[0, 1]], autres: [2] },
  anniversaires: { colonnes: ['x (birthday as an angle round the circle, one ring per group)', 'y (same)', 'group number (label)'], memeLongueur: [[0, 1]], autres: [2] },
  spiraleUlam: { colonnes: ['x on the Ulam spiral', 'y on the Ulam spiral', 'the prime itself'], memeLongueur: [[0, 1]], autres: [2] },
  solidesPlatoniques: { colonnes: ['x', 'y', 'z (the edges of the solid)'], memeLongueur: [[0, 1, 2]], autres: [] },
  montyHall: { colonnes: ['games played', 'share of games won so far', 'strategy (0 = stick, 1 = switch)'], memeLongueur: [], autres: [0, 1, 2] },
  pascalSierpinski: { colonnes: ['position in the row (k - n/2)', 'row (minus n, top to bottom)', 'row number n (label)'], memeLongueur: [[0, 1]], autres: [2] },
});

export const SYSTEMES = Object.freeze([
  { id: 'marcheAleatoire', nom: 'Random walks on a grid', science: 'Probability', D: 3, params: { marcheurs: 500, pas: 200, graine: 1 },
    bornes: { marcheurs: [50, 2000], pas: [10, 1000], graine: [1, 1000000] },
    phrase: 'A visualisation of random walks: walkers step to a random neighbour on a grid, one frame per walker. However wild each path looks, the mean squared distance from the start after n steps is exactly n, with an exact spread n^2 - n; on average nobody drifts anywhere. A finite number of walkers, so the agreement is statistical.' },
  { id: 'aiguilleBuffon', nom: 'Buffon\'s needles (finding pi by throwing needles)', science: 'Geometric probability', D: 3, nuage: true, params: { aiguilles: 2000, longueur: 0.8, graine: 1 },
    bornes: { aiguilles: [100, 20000], longueur: [0.1, 1], graine: [1, 1000000] },
    phrase: 'A visualisation of Buffon\'s needle problem: needles of length l thrown at random on a floor of boards one unit wide. The share that crosses a line is exactly 2 l / pi, so the needles themselves estimate pi. A finite number of needles, so the agreement is statistical.' },
  { id: 'anniversaires', nom: 'The birthday paradox', science: 'Probability', D: 3, nuage: true, params: { personnes: 23, jours: 365, groupes: 2000, graine: 1 },
    bornes: { personnes: [2, 80], jours: [50, 400], groupes: [100, 5000], graine: [1, 1000000] },
    phrase: 'A visualisation of the birthday paradox: groups of k people with random birthdays among D days, drawn round a circle. The chance that two share a birthday is exactly 1 - (1 - 1/D)(1 - 2/D)...(1 - (k - 1)/D), already above one half for 23 people and 365 days, and the mean number of shared pairs is k (k - 1) / (2D). A finite number of groups, so the agreement is statistical.' },
  { id: 'spiraleUlam', nom: 'Primes on the Ulam spiral', science: 'Number theory', D: 3, nuage: true, params: { jusqua: 10000 },
    bornes: { jusqua: [1000, 40000] },
    phrase: 'A visualisation of the prime numbers placed on the Ulam spiral (1 in the middle, the integers winding outwards): they gather along diagonals. The exact count of primes up to N, found by a sieve, is compared with the prime number theorem, Li(N) and N / ln N, which are approximations and say so.' },
  { id: 'pascalSierpinski', nom: 'The triangle of Pascal, odd numbers only (Sierpinski)', science: 'Combinatorics', D: 3, nuage: true, params: { lignes: 128 },
    bornes: { lignes: [8, 512] },
    phrase: 'A visualisation of the triangle of Pascal built row by row by addition, keeping only whether each number is odd: the odd ones draw the Sierpinski triangle. Row n holds exactly 2^(number of 1s in n written in binary) odd numbers, and the first 2^m rows hold exactly 3^m of them.' },
  { id: 'solidesPlatoniques', nom: 'The five Platonic solids', science: 'Geometry', D: 3, nuage: true, params: { solide: 3 },
    bornes: { solide: [0, 4] },
    phrase: 'A visualisation of the five Platonic solids (0 tetrahedron, 1 cube, 2 octahedron, 3 dodecahedron, 4 icosahedron), drawn by their edges in 3-D. Their faces are found from the geometry alone and counted: vertices - edges + faces is always 2 (Euler), and the angle between two faces is the exact sin(theta / 2) = cos(pi / q) / sin(pi / p).' },
  { id: 'montyHall', nom: 'The Monty Hall problem', science: 'Probability', D: 3, nuage: true, params: { portes: 3, parties: 2000, graine: 1 },
    bornes: { portes: [3, 10], parties: [100, 5000], graine: [1, 1000000] },
    phrase: 'A visualisation of the Monty Hall game: a car behind one of n doors, you pick one, the host opens a losing door among the others, and you stick or switch. Played many times with the same draws, the share won by switching settles on (n - 1)/(n (n - 2)), 2/3 with three doors, and sticking on 1/n. A finite number of games, so the agreement is statistical.' },
  { id: 'apollonius', nom: 'Circles inside circles (the gasket of Apollonius)', science: 'Geometry', D: 3, nuage: true, params: { premier: 0.5, generations: 5 },
    bornes: { premier: [0.2, 0.8], generations: [1, 6] },
    phrase: 'A visualisation of the gasket of Apollonius: into every gap between three touching circles goes the circle that touches all three, again and again. Each circle is found by geometry alone, then compared with the theorem of Descartes, (k1 + k2 + k3 + k4)^2 = 2 (k1^2 + k2^2 + k3^2 + k4^2) for their curvatures, and with its complex form for their centres. With two equal starting circles every curvature is a whole number: 2, 3, 6, 11, 14, 15...' },
  { id: 'tasDeSable', nom: 'The abelian sandpile (and its identity)', science: 'Combinatorics', D: 3, nuage: true, params: { cote: 32 },
    bornes: { cote: [8, 40] }, /* MESURE game150 : 205 ms a 48, 110 ms a 40 (n = 1500) */
    phrase: 'A visualisation of the abelian sandpile: a cell holding four grains topples and gives one to each neighbour, grains falling off the edge are lost. The order of the topples never matters. The picture is the identity of the sandpile group on the grid. The stable piles that come back again and again are counted one by one on small grids (192 on 2 x 2, 100352 on 3 x 3) and match the determinant of the grid Laplacian, the number of spanning trees.' },
  { id: 'vergerEuclide', nom: 'Euclid\'s orchard (which trees can you see?)', science: 'Number theory', D: 3, nuage: true, params: { cote: 60 },
    bornes: { cote: [10, 200] },
    phrase: 'A visualisation of Euclid\'s orchard: a tree at every whole point (a, b), and you stand at the corner. You see a tree only when no other tree stands in front of it, which happens exactly when a and b share no factor. The trees seen are counted one by one and match two exact formulas, with Euler\'s phi and with Mobius; their share tends to 6/pi^2, about 61 percent, but only as a limit, and the gap is shown.' },
  { id: 'cerclesFord', nom: 'Ford circles (fractions that touch)', science: 'Number theory', D: 3, nuage: true, params: { ordre: 12 },
    bornes: { ordre: [3, 60] },
    phrase: 'A visualisation of Ford circles: on every fraction p/q between 0 and 1 sits a circle of radius 1/(2 q^2). They never overlap, and two circles touch exactly when |ps - qr| = 1, which is true of any two neighbours in the Farey sequence. Each fraction is listed, the touching is measured, and their number matches 1 + phi(1) + ... + phi(n).' },
  { id: 'fermatSteiner', nom: 'The shortest roads between four towns (Steiner)', science: 'Geometry', D: 3, nuage: true, params: { largeur: 1.3 },
    bornes: { largeur: [0.6, 1.7] },
    phrase: 'A visualisation of the Steiner problem: join the four corners of a rectangle with the shortest possible roads, allowing two extra crossroads. The crossroads are found by moving each to the point that is nearest in total to its three neighbours. Every crossroad ends with three roads at exactly 120 degrees, and the total matches min(L + sqrt 3, 1 + sqrt(3) L): 1 + sqrt 3 for a square, shorter than both the cross of the diagonals and any network without crossroads.' },
  { id: 'causticTasse', nom: 'The bright curve in a cup of coffee (caustic)', science: 'Optics', D: 3, nuage: true, params: { rayons: 600 },
    bornes: { rayons: [100, 3000] },
    phrase: 'A visualisation of the caustic in a cup: parallel sunlight reflected by the round wall piles up along a bright curve. Each pair of neighbouring reflected rays is crossed, and the crossings land on the nephroid ((3 cos t - cos 3t)/4, (3 sin t - sin 3t)/4), with its sharp point at half the radius. The gap shrinks as one over the number of rays squared, and is shown.' },
  { id: 'papillonHofstadter', nom: 'Hofstadter\'s butterfly', science: 'Quantum physics', D: 3, nuage: true, params: { qmax: 16 },
    bornes: { qmax: [6, 20] },
    phrase: 'A visualisation of Hofstadter\'s butterfly: the allowed energies of an electron on a square grid in a magnetic field of p/q flux quanta per square, for every fraction up to q. Each spectrum is q bands, whose edges are found exactly as eigenvalues; between them the gaps are all open, except the middle one when q is even, where the two central bands touch at zero.' },
  { id: 'dominosKasteleyn', nom: 'Domino tilings (Kasteleyn)', science: 'Combinatorics', D: 3, nuage: true, params: { hauteur: 6, largeur: 12, graine: 1 },
    bornes: { hauteur: [2, 8], largeur: [2, 20], graine: [1, 1000000] },
    phrase: 'A visualisation of domino tilings: every way of covering an m x L rectangle with 1 x 2 dominoes is counted exactly, column by column, and matches Kasteleyn\'s product formula (12 988 816 for a chessboard). The picture is one tiling drawn uniformly at random among them all, and the corner statistics of many such draws match their exact probability.' },
  { id: 'ising', nom: 'The Ising model (magnets that agree)', science: 'Statistical physics', D: 3, nuage: true, params: { beta: 0.4, graine: 1 },
    bornes: { beta: [0.1, 0.8], graine: [1, 1000000] },
    phrase: 'A visualisation of the Ising model: tiny magnets on a grid, each preferring to point like its neighbours, at an inverse temperature beta. The picture is a large grid simulated by the Metropolis rule. On a small 4 x 4 torus every one of the 65 536 states is counted exactly, and the simulated mean bond sum (minus the energy) and magnetisation match those exact values within their error bars. The sharp transition of an endless grid, at beta = ln(1 + sqrt 2)/2, is shown as a limit only.' },
  { id: 'aztecDiamond', nom: 'The Aztec diamond and its arctic circle', science: 'Combinatorics', D: 3, nuage: true, params: { ordre: 36, graine: 1 },
    bornes: { ordre: [4, 60], graine: [1, 1000000] },
    phrase: 'A visualisation of a random domino tiling of the Aztec diamond, drawn uniformly by domino shuffling. Near the four corners the dominoes freeze into brick walls; inside a circle they mix freely. The count of tilings, 2^(n(n+1)/2), is checked on small diamonds, the shuffling is tested for uniformity, and the frozen corners are measured against the arctic circle of radius n/sqrt 2, which is a limit for large diamonds.' },
  { id: 'collectionneur', nom: 'The coupon collector', science: 'Probability', D: 3, nuage: true, params: { vignettes: 50, graine: 1 },
    bornes: { vignettes: [5, 200], graine: [1, 1000000] },
    phrase: 'A visualisation of the coupon collector: draw coupons at random, with repeats, until you own all n. The last ones are slow to come. Over thousands of simulated collections the mean number of draws matches n (1 + 1/2 + ... + 1/n) and its variance matches the exact formula, both computed as exact fractions; the mean number of different coupons after t draws follows n (1 - (1 - 1/n)^t).' },
  { id: 'ruineJoueur', nom: 'Gambler\'s ruin', science: 'Probability', D: 3, nuage: true, params: { gain: 0.5, depart: 10, objectif: 20, graine: 1 },
    bornes: { gain: [0.3, 0.7], depart: [1, 39], objectif: [4, 40], graine: [1, 1000000] },
    phrase: 'A visualisation of the gambler\'s ruin: start with z, win or lose one each bet, and stop at zero or at the target a. Over 20 000 simulated games the share that ends in ruin matches Feller\'s exact formula, linear in z for a fair game, and the mean length of a game matches its exact value too. A small edge changes everything.' },
  { id: 'catalanDyck', nom: 'Catalan numbers and Dyck paths', science: 'Combinatorics', D: 3, nuage: true, params: { demi: 120, graine: 1 },
    bornes: { demi: [5, 400], graine: [1, 1000000] },
    phrase: 'A visualisation of Dyck paths: mountain ranges of n ups and n downs that never go below the ground. Every such path is counted one by one for small n and matches the Catalan numbers 1, 1, 2, 5, 14, 42, 132... = binom(2n, n)/(n + 1). The pictures are paths drawn uniformly at random by the cycle lemma, a draw that is tested for fairness.' },
  { id: 'partitionEuler', nom: 'Integer partitions (Euler\'s pentagonal theorem)', science: 'Number theory', D: 3, nuage: true, params: { entier: 100, graine: 1 },
    bornes: { entier: [5, 200], graine: [1, 1000000] },
    phrase: 'A visualisation of integer partitions: the ways to write n as a sum of positive whole numbers, drawn as a Young diagram chosen uniformly at random. Their number p(n) is computed by Euler\'s pentagonal recurrence and checked against an independent count for every n up to 200 (p(100) = 190 569 292).' },
  { id: 'courbeDragon', nom: 'The dragon curve (folding paper)', science: 'Geometry', D: 3, nuage: true, params: { plis: 12 },
    bornes: { plis: [3, 15] },
    phrase: 'A visualisation of the Heighway dragon: fold a strip of paper in half n times, unfold every crease to a right angle, and the strip draws a dragon. Its turns are built two independent ways that agree turn by turn; it has exactly 2^n segments, never runs over itself, and its two ends are exactly 2^(n/2) apart.' },
  { id: 'theoremePick', nom: 'Pick\'s theorem (area by counting points)', science: 'Geometry', D: 3, nuage: true, params: { sommets: 12, rayon: 20, graine: 1 },
    bornes: { sommets: [3, 30], rayon: [8, 40], graine: [1, 1000000] },
    phrase: 'A visualisation of Pick\'s theorem: a random polygon whose corners sit on whole-number points. Its area from the shoelace formula equals I + B/2 - 1, where I and B are the whole points inside and on the boundary, counted one by one. A bow tie that crosses itself shows why the polygon must be simple.' },
  { id: 'percolationLiens', nom: 'Bond percolation: crossing at p = 1/2', science: 'Probability', D: 3, nuage: true, params: { cote: 12, graine: 1 },
    bornes: { cote: [2, 40], graine: [1, 1000000] },
    phrase: 'A visualisation of bond percolation: every link of a grid is open with probability one half. A rectangle n + 1 wide and n high is crossed from left to right with probability exactly 1/2, by duality. Every configuration of the two smallest cases is enumerated, random rectangles are drawn, and a square that misses the symmetry is shown as a witness.' },
  { id: 'napoleon', nom: 'Napoleon\'s theorem', science: 'Geometry', D: 3, nuage: true, params: { taille: 12, graine: 1 },
    bornes: { taille: [3, 40], graine: [1, 1000000] },
    phrase: 'A visualisation of Napoleon\'s theorem: put an equilateral triangle on each side of any triangle, and their three centres always form an equilateral triangle. Everything is computed exactly with numbers a + b sqrt 3, so the three sides are compared as identical, not just close; squares in place of the triangles show the rule breaking.' },
  { id: 'billardElliptique', nom: 'The elliptic billiard and its caustic', science: 'Geometry', D: 3, nuage: true, params: { petitAxe: 0.6, lancer: 20, tir: 70, rebonds: 400 },
    bornes: { petitAxe: [0.3, 0.95], lancer: [0, 359], tir: [5, 175], rebonds: [10, 2000] },
    phrase: 'A visualisation of a billiard ball bouncing inside an ellipse: every straight run stays tangent to one same confocal curve, an ellipse or a hyperbola, called the caustic. The confocal parameter of every chord is computed and stays constant to round-off over hundreds of bounces; bouncing on a wrong normal makes it drift.' },
  { id: 'feuerbach', nom: 'Feuerbach\'s theorem (the nine-point circle)', science: 'Geometry', D: 3, nuage: true, params: { taille: 20, graine: 1 },
    bornes: { taille: [5, 40], graine: [1, 1000000] },
    phrase: 'A visualisation of Feuerbach\'s theorem: the nine-point circle of a triangle touches its inscribed circle from inside and its three escribed circles from outside. The triangles have whole-number corners and sides, so every centre and radius is a fraction and the four tangencies are checked exactly; the circumscribed circle, which does not touch, is shown as a witness.' },
  { id: 'jeuDeLaVie', nom: 'Game of Life oscillators', science: 'Computation', D: 3, nuage: true, params: { oscillateur: 1 },
    bornes: { oscillateur: [0, 2] },
    phrase: 'A visualisation of three oscillators of Conway\'s Game of Life: the blinker, the pulsar and the pentadecathlon. Each is run on an unbounded grid until its set of live cells equals the start exactly, which gives its period: 2, 3 and 15. A glider, which travels instead of returning, is the witness.' },
  { id: 'marcheAutoEvitante', nom: 'Self-avoiding walks', science: 'Combinatorics', D: 3, nuage: true, params: { etapes: 10, graine: 1 },
    bornes: { etapes: [2, 12], graine: [1, 1000000] },
    phrase: 'A visualisation of self-avoiding walks: paths on a grid that never visit the same point twice. No formula is known for how many there are, so every walk of up to 12 steps is counted one by one and matched against the published sequence (324 932 for 12 steps). Walks that only avoid stepping straight back are the witness: from 4 steps on they are more numerous.' },
  { id: 'eulerSolides', nom: 'Euler\'s formula beyond the Platonic solids', science: 'Geometry', D: 3, nuage: true, params: { solide: 3 },
    bornes: { solide: [0, 5] },
    phrase: 'A visualisation of Euler\'s formula V - E + F = 2 on six more solids (0 triangular prism, 1 square antiprism, 2 cuboctahedron, 3 truncated icosahedron, 4 rhombicuboctahedron, 5 snub dodecahedron). Vertices, edges and faces are each counted from the coordinates alone; a square picture frame, a solid with a hole, gives 0 instead of 2.' },
  { id: 'morley', nom: 'Morley\'s trisector theorem', science: 'Geometry', D: 3, nuage: true, params: { angleA: 70, angleB: 45 },
    bornes: { angleA: [15, 120], angleB: [15, 55] },
    phrase: 'A visualisation of Morley\'s theorem: cut each angle of any triangle into three equal parts, and the trisectors next to each side meet in three points that always form an equilateral triangle, of side 8 R sin(A/3) sin(B/3) sin(C/3). Cutting the angles in four instead breaks it.' },
  { id: 'bale', nom: 'The Basel problem (1 + 1/4 + 1/9 + ... = pi^2/6)', science: 'Number theory', D: 3, nuage: true, params: { termes: 100 },
    bornes: { termes: [1, 2000] },
    phrase: 'A visualisation of the Basel problem: the sums 1 + 1/4 + 1/9 + ... + 1/n^2 climb towards pi^2/6. They are computed as exact fractions, and for every n the gap to pi^2/6 is checked to lie strictly between 1/(n+1) and 1/n. The plain sum 1 + 1/2 + 1/3 + ..., which never stops growing, is the witness.' },
  { id: 'simsonDroite', nom: 'The Simson line', science: 'Geometry', D: 3, nuage: true, params: { taille: 12, corde: 3, graine: 1 },
    bornes: { taille: [4, 30], corde: [-30, 30], graine: [1, 1000000] },
    phrase: 'A visualisation of the Simson line: from any point on the circle through the corners of a triangle, drop perpendiculars to the three sides; their feet always lie on one straight line. Everything is computed in exact fractions, so the line is checked exactly; a point just outside the circle breaks it.' },
  { id: 'distinctesImpaires', nom: 'Distinct parts equal odd parts (Euler)', science: 'Number theory', D: 3, nuage: true, params: { entier: 30, graine: 1 },
    bornes: { entier: [3, 120], graine: [1, 1000000] },
    phrase: 'A visualisation of Euler\'s partition theorem: there are as many ways to write n as a sum of different numbers as there are ways to write it as a sum of odd numbers. Both are counted separately for every n, and a random partition is carried across by Glaisher\'s halving map and back again.' },
  { id: 'triangulations', nom: 'Triangulations of a polygon (Catalan numbers)', science: 'Combinatorics', D: 3, nuage: true, params: { cotes: 9, graine: 1 },
    bornes: { cotes: [3, 30], graine: [1, 1000000] },
    phrase: 'A visualisation of polygon triangulations: cut a convex polygon into triangles with diagonals that never cross. The number of ways is a Catalan number (1, 2, 5, 14, 42, ...), counted by splitting along one side and checked against binom(2m, m)/(m + 1); a random triangulation is drawn and checked for crossings.' },
  { id: 'ramseyR33', nom: 'Ramsey number R(3, 3) = 6', science: 'Combinatorics', D: 3, nuage: true, params: { sommetsK: 5, graine: 1 },
    bornes: { sommetsK: [3, 6], graine: [1, 1000000] },
    phrase: 'A visualisation of the Ramsey number R(3, 3) = 6: colour every line between n points red or blue. With 5 points you can avoid a triangle of one colour (12 ways, each colour a 5-cycle); with 6 points you never can. Every colouring is checked; forbidding only red triangles is the witness that both colours are needed.' },
  { id: 'pascalHexagramme', nom: 'Pascal\'s hexagram', science: 'Geometry', D: 3, nuage: true, params: { croise: 0, graine: 1 },
    bornes: { croise: [0, 1], graine: [1, 1000000] },
    phrase: 'A visualisation of Pascal\'s theorem: take six points on a circle in any order, join them into a hexagon, and the three pairs of opposite sides meet in three points on one straight line. The points are rational, so the line is checked exactly; moving one point off the circle breaks it.' },
  { id: 'ptolemee', nom: 'Ptolemy\'s theorem', science: 'Geometry', D: 3, nuage: true, params: { graine: 1 },
    bornes: { graine: [1, 1000000] },
    phrase: 'A visualisation of Ptolemy\'s theorem: for four points on a circle, the product of the diagonals equals the sum of the products of opposite sides. The points are rational, so the squared lengths are fractions and the identity is checked exactly; a corner pushed off the circle gives a strict inequality.' },
  { id: 'sommesCarres', nom: 'Sums of squares (Jacobi)', science: 'Number theory', D: 3, nuage: true, params: { entier: 100 },
    bornes: { entier: [4, 300] },
    phrase: 'A visualisation of sums of squares: the number of ways to write n as a sum of four squares is 8 times the sum of its divisors not divisible by 4 (Jacobi), and as a sum of two squares it is 4 times the divisors of the form 4k + 1 minus those of the form 4k + 3. Every way is counted one by one up to n; the plain divisor sum is the witness.' },
  { id: 'equationPell', nom: 'Pell\'s equation x^2 - D y^2 = 1', science: 'Number theory', D: 3, nuage: true, params: { radical: 13 },
    bornes: { radical: [2, 99] },
    phrase: 'A visualisation of Pell\'s equation: for D not a square, the smallest whole solution of x^2 - D y^2 = 1 hides in the continued fraction of the square root of D (for D = 13 it is 649 and 180). The fractions are computed in whole numbers, the solution is checked exactly and shown to be the smallest; x^2 - 3 y^2 = -1, which has no solution, is the witness.' },
  { id: 'nombresCarmichael', nom: 'Carmichael numbers (Fermat liars)', science: 'Number theory', D: 3, nuage: true, params: { limite: 10000 },
    bornes: { limite: [600, 20000] },
    phrase: 'A visualisation of Carmichael numbers: composite numbers that pass Fermat\'s primality test a^(n-1) = 1 mod n for every base a. They are found by Korselt\'s rule (561, 1105, 1729, ...), each one is checked to fool base 2, and 341, which fools base 2 but not base 3, is the witness.' },
  { id: 'theoremeWilson', nom: 'Wilson\'s theorem', science: 'Number theory', D: 3, nuage: true, params: { limite: 300 },
    bornes: { limite: [30, 3000] },
    phrase: 'A visualisation of Wilson\'s theorem: n is prime exactly when (n - 1)! leaves remainder n - 1 when divided by n. Every remainder is computed exactly up to the slider and compared with trial division; n = 4, the one composite with remainder 2 instead of 0, is the witness.' },
  { id: 'fonctionMertens', nom: 'The Mertens function', science: 'Number theory', D: 3, nuage: true, params: { limite: 1000 },
    bornes: { limite: [50, 3000] },
    phrase: 'A visualisation of the Mertens function: add up the Mobius function mu(1) + ... + mu(n), +1, -1 or 0 for each number, and watch the walk. For every n the exact identity sum of M(n div k) = 1 is checked; the same sum with the Liouville function gives the integer part of the square root instead.' },
  { id: 'parfaitsAmicaux', nom: 'Perfect and amicable numbers', science: 'Number theory', D: 3, nuage: true, params: { limite: 10000 },
    bornes: { limite: [300, 20000] },
    phrase: 'A visualisation of perfect and amicable numbers: n is perfect when its proper divisors add up to n (6 = 1 + 2 + 3), and two numbers are amicable when each one\'s divisors add up to the other (220 and 284). They are found exactly up to the slider, each even perfect number is checked to have Euclid\'s form 2^(p-1)(2^p - 1); 2047 = 23 x 89, which breaks that form, is the witness.' },
  { id: 'nombresBernoulli', nom: 'Bernoulli numbers', science: 'Number theory', D: 3, nuage: true, params: { rangB: 30 },
    bornes: { rangB: [12, 60] },
    phrase: 'A visualisation of the Bernoulli numbers 1, -1/2, 1/6, 0, -1/30, ..., computed as exact fractions. They are checked against sums of powers 0^p + 1^p + ... (Faulhaber\'s formula) and against the von Staudt-Clausen rule that makes B_2k plus some unit fractions a whole number; the old convention B_1 = +1/2 is the witness that breaks the power sums.' },
  { id: 'problemeJosephus', nom: 'The Josephus problem', science: 'Combinatorics', D: 3, nuage: true, params: { personnes: 41, pasK: 3 },
    bornes: { personnes: [2, 300], pasK: [2, 9] },
    phrase: 'A visualisation of the Josephus problem: n people stand in a circle and every k-th one is removed until one is left. The circle is really played out for every size and the survivor checked against the recurrence (and against 2L + 1 when k = 2); that formula used for k = 3 is the witness.' },
  { id: 'zeckendorf', nom: 'Zeckendorf representation', science: 'Number theory', D: 3, nuage: true, params: { entier: 100 },
    bornes: { entier: [30, 5000] },
    phrase: 'A visualisation of Zeckendorf\'s theorem: every whole number is, in exactly one way, a sum of Fibonacci numbers that are all different and never neighbours. The greedy writing is built for every n and the uniqueness checked by counting every possible writing; allowing neighbours, which gives several writings, is the witness.' },
  { id: 'theoremeLucas', nom: 'Lucas\'s theorem (Pascal\'s triangle mod p)', science: 'Number theory', D: 3, nuage: true, params: { baseP: 3, lignesL: 60 },
    bornes: { baseP: [2, 7], lignesL: [9, 120] },
    phrase: 'A visualisation of Lucas\'s theorem: Pascal\'s triangle taken modulo a prime p draws a fractal, and each entry is the product of the small binomials of the base-p digits. The triangle is built by additions and compared cell by cell to that rule; the same rule with the composite modulus 4 fails, and is the witness.' },
  { id: 'calkinWilf', nom: 'The Calkin-Wilf tree', science: 'Number theory', D: 3, nuage: true, params: { niveaux: 10 },
    bornes: { niveaux: [5, 14] },
    phrase: 'A visualisation of the Calkin-Wilf tree: start from 1/1, and under every a/b put a/(a + b) and (a + b)/b. Read level by level it lists every positive fraction exactly once, already reduced, and the n-th one is fusc(n)/fusc(n + 1). Uniqueness and completeness are checked level by level; Cantor\'s diagonal listing, which repeats values, is the witness.' },
  { id: 'toursHanoi', nom: 'Towers of Hanoi and the Gray code', science: 'Combinatorics', D: 3, nuage: true, params: { disques: 8 },
    bornes: { disques: [1, 16] },
    phrase: 'A visualisation of the Towers of Hanoi: moving n disks one at a time, never a big one on a small one, takes 2^n - 1 moves. The puzzle is really played out, every move checked legal, and the disk moved at step m matches the bit that changes in the Gray code; ordinary binary counting, which changes several bits at once, is the witness.' },
  { id: 'regarderDire', nom: 'The look-and-say sequence', science: 'Combinatorics', D: 3, nuage: true, params: { rangs: 25 },
    bornes: { rangs: [15, 30] },
    phrase: 'A visualisation of the look-and-say sequence: start from 1 and read each term aloud to get the next (1, 11, 21, 1211, 111221, ...). Every term is built exactly; on every one the digits stay at 1, 2 and 3 and the block 333 never appears (measured). The seed 22, which reads itself forever, is the witness.' },
  { id: 'derangements', nom: 'Derangements (no one gets their own hat)', science: 'Combinatorics', D: 3, nuage: true, params: { objets: 6, graine: 1 },
    bornes: { objets: [3, 8], graine: [1, 1000000] },
    phrase: 'A visualisation of derangements: shuffles in which nothing stays in its place. All shuffles of up to 8 objects are listed and counted, the count matches inclusion-exclusion and the recurrence, and for every n from 1 to 30 it is the whole number nearest to n!/e. The case n = 0, where that rounding fails, is the witness.' },
  { id: 'nombresHarmoniques', nom: 'Harmonic numbers', science: 'Number theory', D: 3, nuage: true, params: { rangs: 60 },
    bornes: { rangs: [20, 200] },
    phrase: 'A visualisation of the harmonic numbers H(n) = 1 + 1/2 + ... + 1/n, kept as exact fractions. For every n they stay between ln(n + 1) and 1 + ln n, and from n = 2 on the denominator holds exactly the largest power of 2 up to n, which is why H(n) is never a whole number. The case n = 1, where H(1) = 1, is the witness.' },
  { id: 'suiteCollatz', nom: 'The Collatz sequence', science: 'Number theory', D: 3, nuage: true, params: { limite: 300 },
    bornes: { limite: [30, 3000] },
    phrase: 'A visualisation of the Collatz (3n + 1) sequence: halve an even number, triple an odd one and add 1. Every start up to the slider is followed until it reaches 1: a finite check of an open conjecture, not a proof. With 3n - 1 instead, the start 5 loops back to itself: that is the witness.' },
  { id: 'routineKaprekar', nom: 'Kaprekar routine', science: 'Number theory', D: 3, nuage: true, params: { longueurK: 4 },
    bornes: { longueurK: [3, 4] },
    phrase: 'A visualisation of the Kaprekar routine: sort the digits high to low and low to high, subtract, repeat. Every start with that many digits is followed, and all of them land on one single fixed point (found here, not assumed). A number whose digits are all equal falls to 0 instead: that is the witness.' },
  { id: 'stirlingBell', nom: 'Stirling and Bell numbers', science: 'Combinatorics', D: 3, nuage: true, params: { elements: 7, graine: 3 },
    bornes: { elements: [4, 9], graine: [1, 1000000] },
    phrase: 'A visualisation of set partitions: every way to split n objects into groups is listed and counted by number of groups (Stirling numbers), and their total (Bell numbers) matches the Aitken triangle up to 20. Naming the groups counts each split twice: that is the witness.' },
  { id: 'motzkinChemins', nom: 'Motzkin numbers (paths above the floor)', science: 'Combinatorics', D: 3, nuage: true, params: { longueurM: 12, graine: 5 },
    bornes: { longueurM: [6, 13], graine: [1, 1000000] },
    phrase: 'A visualisation of Motzkin paths: walks of up, down and flat steps that start and end at ground level and never go below it. Every path of that length is listed and counted, and the count matches two separate formulas up to 40. Without the floor there are 3 paths of length 2 instead of 2: that is the witness.' },
  { id: 'periodePisano', nom: 'Pisano periods (Fibonacci on a clock)', science: 'Number theory', D: 3, nuage: true, params: { moduleMax: 120 },
    bornes: { moduleMax: [30, 400] },
    phrase: 'A visualisation of Pisano periods: the Fibonacci numbers read on a clock with m hours always come back to the start, and the period of that loop is measured for every m up to the slider. The period of a product is the lcm of the periods, and every period is even, from m = 3 on. The clock with 2 hours, period 3, is the witness.' },
  { id: 'indicatriceEuler', nom: 'Euler totient function', science: 'Number theory', D: 3, nuage: true, params: { jusquaN: 300 },
    bornes: { jusquaN: [40, 3000] },
    phrase: 'A visualisation of Euler totient: for each n, how many numbers up to n share no factor with it. For every n up to the slider the counts over its divisors add back up to n, and the count of a product is the product of the counts when the factors share nothing. With 2 and 2, which share a factor, that fails: phi(4) = 2, not 1. That is the witness.' },
  { id: 'goldbachPaires', nom: 'Goldbach splits (two odd primes)', science: 'Number theory', D: 3, nuage: true, params: { pairMax: 2000 },
    bornes: { pairMax: [60, 8000] },
    phrase: 'A visualisation of the Goldbach conjecture: every even number from 6 on seems to be a sum of two odd primes. Every even number up to the slider is split and its splits are counted: a finite check of an open question, not a proof. The number 4 has no such split (it would need 2 + 2): that is the witness.' },
  { id: 'frobeniusPieces', nom: 'The coin problem (Frobenius, two coins)', science: 'Number theory', D: 3, nuage: true, params: { pieceMax: 30 },
    bornes: { pieceMax: [11, 50] },
    phrase: 'A visualisation of the coin problem: with two coins that share no factor, which amounts can never be paid? For every pair up to the slider the payable amounts are marked one by one, and the largest impossible amount and the number of impossible ones match the formulas of Sylvester. Coins 6 and 9 share a factor, so there is no largest impossible amount: that is the witness.' },
  { id: 'schroderChemins', nom: 'Large Schroder numbers', science: 'Combinatorics', D: 3, nuage: true, params: { longueurS: 7, graine: 2 },
    bornes: { longueurS: [4, 9], graine: [1, 1000000] },
    phrase: 'A visualisation of Schroder paths: walks of up, down and long flat steps that start and end on the ground and never dip below it. Every path of that size is listed and counted, the count matches two separate recurrences up to 30, and from 1 on every count is even. The count for 0 is 1, which is odd: that is the witness.' },
  { id: 'triangleNarayana', nom: 'The Narayana triangle (paths by peaks)', science: 'Combinatorics', D: 3, nuage: true, params: { rangN: 9 },
    bornes: { rangN: [5, 11] },
    phrase: 'A visualisation of the Narayana triangle: mountain paths sorted by how many peaks they have. Every path of each size is listed and counted by peaks, each row matches the formula, adds up to a Catalan number and reads the same both ways. Sorting the same paths by returns to the ground gives a lopsided row instead: that is the witness.' },
  { id: 'suiteRecaman', nom: 'The Recaman sequence', science: 'Number theory', D: 3, nuage: true, params: { rangR: 400 },
    bornes: { rangR: [40, 3000] },
    phrase: 'A visualisation of the Recaman sequence: at step n, jump back by n if that lands on a new positive number, otherwise jump forward by n. Every jump up to the slider is checked against that rule. Whether every number eventually appears is an open question and is not claimed here. Jumping forward can still land on an old number, 42 at step 24: that is the witness.' },
  { id: 'suiteKolakoski', nom: 'The Kolakoski sequence', science: 'Combinatorics', D: 3, nuage: true, params: { rangK: 2000 },
    bornes: { rangK: [60, 20000] },
    phrase: 'A visualisation of the Kolakoski sequence: a string of 1s and 2s whose run lengths spell out the string itself. Every complete run up to the slider is checked against the term it should match, and the share of 1s is measured (whether it settles at one half is an open question, not claimed here). The plain 1, 2, 1, 2 pattern does not describe itself: that is the witness.' },
  { id: 'suitePerrin', nom: 'The Perrin sequence and its pseudoprimes', science: 'Number theory', D: 3, nuage: true, params: { perrinMax: 1000 },
    bornes: { perrinMax: [30, 3000] },
    phrase: 'A visualisation of the Perrin sequence 3, 0, 2, 3, 2, 5, 5, ...: every prime n divides the n-th term. For every n up to the slider the remainder is computed, and the primes all sit on the floor. The converse fails: 271441 is not prime, yet it divides its term too (computed here by matrix powers): that is the witness.' },
  { id: 'thueMorse', nom: 'The Thue-Morse sequence', science: 'Combinatorics', D: 3, nuage: true, params: { rangT: 2048 },
    bornes: { rangT: [64, 8192] },
    phrase: 'A visualisation of the Thue-Morse sequence 0 1 1 0 1 0 0 1 ..., drawn by a turtle that walks on 0 and turns on 1. It is built two separate ways that agree, no block ever appears three times in a row in what is shown, and the numbers marked 0 and 1 share the same sums of powers below a limit. At that limit the sums differ: that is the witness.' },
  { id: 'suitePadovan', nom: 'The Padovan sequence', science: 'Number theory', D: 3, nuage: true, params: { rangP: 120 },
    bornes: { rangP: [60, 400] },
    phrase: 'A visualisation of the Padovan sequence 1, 0, 0, 1, 0, 1, 1, 1, 2, 2, 3, 4, ...: each term is the sum of the terms two and three places back. A second rule (one back plus five back) gives the same numbers, and the ratio of neighbours closes in on the plastic number, the root of x^3 = x + 1. Starting from 1, 1, 1 gives the same numbers five places later: that is the witness.' },
  { id: 'fourmiLangton', nom: "Langton's ant", science: 'Combinatorics', D: 3, nuage: true, params: { pasL: 14000 },
    bornes: { pasL: [10500, 30000] },
    phrase: "A visualisation of Langton's ant: on a white square it turns right, on a black one left, flips the square and steps forward. After about ten thousand chaotic steps it builds a highway that repeats every 104 steps, moving two squares on each axis; both facts are measured on every step shown. Other periods do not fit: that is the witness." },
  { id: 'gammeTemperee', nom: 'Equal temperament (tuning a piano)', science: 'Acoustics', D: 3, nuage: true, params: { divisions: 12 },
    bornes: { divisions: [5, 72] },
    phrase: 'A visualisation of equal temperament: the octave is cut into N equal steps (12 on a piano), and each step is compared with the nearest simple ratio a string would give. The fifth comes out about 2 cents flat and the major third about 14 cents sharp. Twelve pure fifths overshoot seven octaves by the Pythagorean comma: that is the witness.' },
  { id: 'entropieShannon', nom: 'Shannon entropy of English letters (Huffman code)', science: 'Information theory', D: 3, nuage: true, params: { lettres: 20000, graine: 1 },
    bornes: { lettres: [500, 200000], graine: [1, 1000000] },
    phrase: 'A visualisation of Shannon entropy: letters drawn with the published frequencies of English (a model that ignores words). Rare letters carry more surprise. A Huffman code built on those frequencies averages between the entropy and one bit more, as Shannon proved. A code with the same length for every letter needs 5 bits: that is the witness.' },
  { id: 'atmosphereStandard', nom: 'The standard atmosphere (US 1976)', science: 'Earth sciences', D: 3, nuage: true, params: { altitudeKm: 20 },
    bornes: { altitudeKm: [5, 20] },
    phrase: 'A visualisation of the standard atmosphere (US 1976): the air cools by 6.5 degrees per kilometre up to 11 km, then stays at 216.65 K. The pressure is integrated step by step from the weight of the air above and matches the closed formula of each layer. Five kilometres measured with a ruler are not the five kilometres of the model: that is the witness.' },
  { id: 'loiZipf', nom: "Zipf's law on real web text", science: 'Linguistics', D: 3, nuage: true, params: { rangsZipf: 30 },
    bornes: { rangsZipf: [10, 30] },
    phrase: "A visualisation of Zipf's law on real data: the 30 most common English words of a large web corpus (Google Web 1T, counted by Peter Norvig), drawn as count against rank on log scales. A straight line is fitted to the top words. Its slope changes with how many words you keep and is not the textbook -1: that is the witness." },
  { id: 'gutenbergRichter', nom: 'Earthquake sizes (Gutenberg-Richter law)', science: 'Seismology', D: 3, nuage: true, params: { bValeur: 1.03, seismes: 5000, graine: 1 },
    bornes: { bValeur: [0.6, 1.5], seismes: [500, 20000], graine: [1, 1000000] },
    phrase: 'A visualisation of the Gutenberg-Richter law: each step up in magnitude makes earthquakes about ten times rarer. Quakes are drawn from the law and its slope b is measured back from them (Aki method). The real 2024 world catalogue (USGS, 6397 quakes) falls off faster than the Californian slope would say: that is the witness.' },
  { id: 'mareeVivesEaux', nom: 'Tides: spring and neap (Providence, NOAA)', science: 'Oceanography', D: 3, nuage: true, params: { jours: 45, partS2: 1 },
    bornes: { jours: [20, 90], partS2: [0.25, 2] },
    phrase: 'A visualisation of the tide at Providence (NOAA constants): the lunar wave M2 and the solar wave S2 added together. High water comes about 50 minutes later each day, and the biggest tides (spring tides) return every 14.77 days, when the two waves line up. With the lunar wave alone every high water is the same: that is the witness.' },
  { id: 'energieLiaison', nom: 'Nuclear binding energy (fusion and the iron peak)', science: 'Nuclear physics', D: 3, nuage: true, params: { reaction: 0 },
    bornes: { reaction: [0, 2] },
    phrase: 'A visualisation of nuclear binding energy measured for eight nuclei (AME2020 mass evaluation): how tightly each nucleus holds its protons and neutrons. Fusing light nuclei releases energy, computed here for three reactions that power stars, and heavy uranium sits lower than iron. Nickel-62, not iron-56, is the most tightly bound: that is the witness.' },
  { id: 'courbeKeeling', nom: 'The Keeling curve (CO2 at Mauna Loa)', science: 'Climate science', D: 3, nuage: true, params: { anDebut: 1959, anFin: 2025 },
    bornes: { anDebut: [1959, 2005], anFin: [1979, 2025] },
    phrase: 'A visualisation of the Keeling curve: the yearly average of carbon dioxide in the air at Mauna Loa, measured by NOAA since 1959. It has gone up every single year, and faster and faster: under 1 ppm a year at the start, over 2.5 ppm a year now. A straight line fitted to the first ten years misses 2025 by about 58 ppm: that is the witness.' },
  { id: 'populationMonde', nom: 'World population since 1950 (UN)', science: 'Demography', D: 3, nuage: true, params: { decennies: 2 },
    bornes: { decennies: [2, 7] },
    phrase: 'A visualisation of world population counted by the United Nations every ten years from 1950 to 2020. It grew every decade, but its growth rate peaked in the 1960s and has fallen ever since. An exponential fitted to 1950-1970 and extended to 2020 overshoots by about two billion people: that is the witness.' },
  { id: 'effetPhotoelectrique', nom: 'The photoelectric effect (Einstein, Millikan)', science: 'Quantum physics', D: 3, nuage: true, params: { lambdaNm: 200, metal: 0 },
    bornes: { lambdaNm: [150, 400], metal: [0, 3] },
    phrase: 'A visualisation of the photoelectric effect: light knocks electrons out of a metal only if each photon carries more energy than the metal holds them with. For four metal surfaces the stopping voltage grows in a straight line with the light frequency, and every line has the same slope, Planck constant over the electron charge. Silver lit at 300 nm emits nothing, however bright the light: that is the witness.' },
  { id: 'demiViesNPL', nom: 'Six published half-lives (NPL 2008)', science: 'Nuclear physics', D: 3, nuage: true, params: { isotope: 2, demiVies: 3 },
    bornes: { isotope: [0, 5], demiVies: [1, 10] },
    phrase: 'A visualisation of radioactive decay with six half-lives published by the UK National Physical Laboratory, from iodine-131 (8 days) to carbon-14 (5700 years). Each isotope keeps exactly half its atoms after one half-life and an eighth after three, so a sample with an eighth of its carbon-14 left is 17101 years old, give or take 90. A straight-line decay would be empty after 1.44 half-lives; the real law still leaves a quarter after two: that is the witness.' },
  { id: 'choleraSnow', nom: 'John Snow and the cholera of 1854', science: 'Epidemiology', D: 3, nuage: true, params: { septSemaines: 1, graine: 1 },
    bornes: { septSemaines: [1, 2], graine: [1, 50] },
    phrase: 'A visualisation of John Snow\'s natural experiment: in the same London streets, houses drinking water from the Southwark and Vauxhall Company died of cholera 8.4 times as often as houses supplied by Lambeth, 315 against 38 deaths per 10,000 houses. Counting deaths alone would say 12.9 times, because one company supplied more houses: that is the witness.' },
  { id: 'raiesBalmer', nom: 'Balmer lines and the Rydberg straight line', science: 'Spectroscopy', D: 3, nuage: true, params: { nPlusHaut: 9 },
    bornes: { nPlusHaut: [4, 9] },
    phrase: 'A visualisation of the visible lines of hydrogen measured by NIST: one over the wavelength falls on a straight line in one over n squared, and its slope gives back the Rydberg constant of hydrogen to better than three parts in a hundred thousand. Taking an infinitely heavy nucleus puts the red line 0.35 nm too short: that is the witness.' },
].map((s) => Object.freeze({ ...s, params: Object.freeze({ ...s.params }), bornes: Object.freeze({ ...s.bornes }) })));
export const ENTIERS = { marcheAleatoire: ['marcheurs', 'pas', 'graine'], aiguilleBuffon: ['aiguilles', 'graine'], anniversaires: ['personnes', 'jours', 'groupes', 'graine'], spiraleUlam: ['jusqua'], pascalSierpinski: ['lignes'], solidesPlatoniques: ['solide'], montyHall: ['portes', 'parties', 'graine'], apollonius: ['generations'], tasDeSable: ['cote'], vergerEuclide: ['cote'], cerclesFord: ['ordre'], fermatSteiner: [], causticTasse: ['rayons'], papillonHofstadter: ['qmax'], dominosKasteleyn: ['hauteur', 'largeur', 'graine'], ising: ['graine'], aztecDiamond: ['ordre', 'graine'], collectionneur: ['vignettes', 'graine'], ruineJoueur: ['depart', 'objectif', 'graine'], catalanDyck: ['demi', 'graine'], partitionEuler: ['entier', 'graine'], courbeDragon: ['plis'], theoremePick: ['sommets', 'rayon', 'graine'], percolationLiens: ['cote', 'graine'], napoleon: ['taille', 'graine'], billardElliptique: ['lancer', 'tir', 'rebonds'], feuerbach: ['taille', 'graine'], jeuDeLaVie: ['oscillateur'], marcheAutoEvitante: ['etapes', 'graine'], eulerSolides: ['solide'], morley: [], bale: ['termes'], simsonDroite: ['taille', 'corde', 'graine'], distinctesImpaires: ['entier', 'graine'], triangulations: ['cotes', 'graine'], ramseyR33: ['sommetsK', 'graine'], pascalHexagramme: ['croise', 'graine'], ptolemee: ['graine'], sommesCarres: ['entier'], equationPell: ['radical'], nombresCarmichael: ['limite'], theoremeWilson: ['limite'], fonctionMertens: ['limite'], parfaitsAmicaux: ['limite'], nombresBernoulli: ['rangB'], problemeJosephus: ['personnes', 'pasK'], zeckendorf: ['entier'], theoremeLucas: ['baseP', 'lignesL'], calkinWilf: ['niveaux'], toursHanoi: ['disques'], regarderDire: ['rangs'], derangements: ['objets', 'graine'], nombresHarmoniques: ['rangs'], suiteCollatz: ['limite'], routineKaprekar: ['longueurK'], stirlingBell: ['elements', 'graine'], motzkinChemins: ['longueurM', 'graine'], periodePisano: ['moduleMax'], indicatriceEuler: ['jusquaN'], goldbachPaires: ['pairMax'], frobeniusPieces: ['pieceMax'], schroderChemins: ['longueurS', 'graine'], triangleNarayana: ['rangN'], suiteRecaman: ['rangR'], suiteKolakoski: ['rangK'], suitePerrin: ['perrinMax'], thueMorse: ['rangT'], suitePadovan: ['rangP'], fourmiLangton: ['pasL'], gammeTemperee: ['divisions'], entropieShannon: ['lettres', 'graine'], atmosphereStandard: [], loiZipf: ['rangsZipf'], gutenbergRichter: ['seismes', 'graine'], mareeVivesEaux: ['jours'], energieLiaison: ['reaction'], courbeKeeling: ['anDebut', 'anFin'], populationMonde: ['decennies'], effetPhotoelectrique: ['metal'], demiViesNPL: ['isotope'], choleraSnow: ['septSemaines', 'graine'], raiesBalmer: ['nPlusHaut'] };
const FONCTIONS = { raiesBalmer, choleraSnow, demiViesNPL, effetPhotoelectrique, populationMonde, courbeKeeling, energieLiaison, mareeVivesEaux, gutenbergRichter, loiZipf, atmosphereStandard, entropieShannon, gammeTemperee, fourmiLangton, suitePadovan, thueMorse, suitePerrin, suiteKolakoski, suiteRecaman, triangleNarayana, schroderChemins, frobeniusPieces, goldbachPaires, indicatriceEuler, periodePisano, motzkinChemins, stirlingBell, routineKaprekar, suiteCollatz, nombresHarmoniques, derangements, regarderDire, toursHanoi, calkinWilf, theoremeLucas, zeckendorf, problemeJosephus, nombresBernoulli, parfaitsAmicaux, fonctionMertens, theoremeWilson, nombresCarmichael, equationPell, sommesCarres, ptolemee, pascalHexagramme, ramseyR33, triangulations, distinctesImpaires, simsonDroite, bale, morley, eulerSolides, marcheAutoEvitante, jeuDeLaVie, feuerbach, billardElliptique, napoleon, percolationLiens, theoremePick, courbeDragon, partitionEuler, catalanDyck, ruineJoueur, collectionneur, aztecDiamond, ising, dominosKasteleyn, papillonHofstadter, causticTasse, fermatSteiner, cerclesFord, vergerEuclide, tasDeSable, apollonius, marcheAleatoire, aiguilleBuffon, anniversaires, spiraleUlam, pascalSierpinski, solidesPlatoniques, montyHall };
const parId = (id) => { const s = SYSTEMES.find((x) => x.id === id); if (!s) throw new Error('systeme inconnu: ' + id); return s; };

function borner(id, params) {
  const s = parId(id), P = {};
  for (const k of Object.keys(s.params)) {
    let v = Number(params && params[k]); if (!Number.isFinite(v)) v = s.params[k];
    const [a, b] = s.bornes[k]; v = Math.min(b, Math.max(a, v));
    if ((ENTIERS[id] || []).includes(k)) v = Math.round(v);
    P[k] = v;
  }
  return P;
}

export function reglagesPhysique(id, params = {}) {
  const s = parId(id), P = borner(id, params);
  return Object.keys(s.params).map((k) => ({ chemin: 'params.' + k, nom: k, min: s.bornes[k][0], max: s.bornes[k][1], valeur: P[k] }));
}

export function simuler(id, params = {}, { n = 1500 } = {}) {
  const s = parId(id), P = borner(id, params);
  n = Math.max(2, Math.floor(n));
  const r = FONCTIONS[id](P, n);
  let fini = true; for (let i = 0; i < r.brut.length; i++) if (!Number.isFinite(r.brut[i])) { fini = false; break; }
  if (!fini) return { params: P, D: r.D, n, bornee: false, raison: 'NaN', brut: null, lyapunov: NaN, uniteLyapunov: r.unite, points: null, invariants: null };
  const o = { params: P, D: r.D, n, bornee: true, brut: r.brut, lyapunov: null, uniteLyapunov: r.unite, points: null, invariants: r.invariants };
  if (s.nuage || r.nuage) o.nuage = true;
  if (r.film) o.film = r.film;
  return o;
}
