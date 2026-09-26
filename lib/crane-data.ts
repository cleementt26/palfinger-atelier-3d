export const PRODUCT_URL = "https://www.palfinger.com/fr/fr/nos-produits/grues/grues-chargement/modeles/pk-53002-sh.html";
export const BROCHURE_URL = "https://www.palfinger.com/content/dam/palfinger/data/importdata/product-data/loader-cranes/brochures/pk-53002-sh/kphpk53002sm2fransicht.pdf";
export type PartId = "base" | "column" | "main" | "knuckle" | "extensions";
export const PARTS: {id:PartId;number:string;title:string;description:string;detail:string}[] = [
  {id:"base",number:"01",title:"Base & stabilisateurs",description:"Les poutres télescopiques et les appuis au sol élargissent l’assise de la grue.",detail:"Écartement constructeur : 7,8 m"},
  {id:"column",number:"02",title:"Colonne de rotation",description:"La couronne permet d’orienter l’ensemble du bras autour de l’axe vertical.",detail:"Rotation continue, sans butée fixe"},
  {id:"main",number:"03",title:"Bras principal",description:"Le vérin entraîne un renvoi à deux biellettes. Leurs longueurs restent fixes : les pivots imposent la rotation du premier bras.",detail:"α : angle du bras principal par rapport au sol"},
  {id:"knuckle",number:"04",title:"Bras secondaire",description:"Un second renvoi ferme la chaîne mécanique au coude. À β = 0°, les bras sont alignés ; Power Link Plus permet de dépasser cet alignement.",detail:"β : angle relatif au premier bras · jusqu’à +15°"},
  {id:"extensions",number:"05",title:"Extensions télescopiques",description:"Six éléments coulissent dans cette maquette, chacun avec son vérin et un recouvrement conservé. Leur sortie successive est une animation illustrative.",detail:"Les six étages se déplacent, du plus grand au plus fin"},
];
export const SPECS = [
  ["Moment de levage maximal", "50,1 t·m", "491,5 kN·m"],
  ["Capacité de levage maximale", "18 200 kg", "À la portée correspondante au diagramme"],
  ["Portée hydraulique maximale", "21,0 m", "Configuration G"],
  ["Avec extensions manuelles", "25,2 m", "Selon équipement"],
  ["Portée avec fly-jib", "32,5 m", "Option ; non représentée en 3D"],
  ["Rotation", "Continue", "Sans butée fixe"],
  ["Pression maximale", "365 bar", "Résumé constructeur et brochure"],
  ["Débit de pompe recommandé", "90–120 l/min", ""],
  ["Écartement des stabilisateurs", "7,8 m", ""],
  ["Largeur repliée", "2,51 m", ""],
  ["Masse standard (brochure)", "4 145 kg", "La page produit mentionne 4 155 kg"],
  ["Couple de rotation", "4,0 / 5,5 t·m", "Avec un / deux moteurs"],
];
export const VARIANTS = [
  {name:"A",reach:"7,7",weight:"4 145"}, {name:"B",reach:"9,7",weight:"4 410"},
  {name:"C",reach:"11,8",weight:"4 685"}, {name:"D",reach:"14,1",weight:"5 000"},
  {name:"E",reach:"16,4",weight:"5 225"}, {name:"F",reach:"18,7",weight:"5 425"},
  {name:"G",reach:"21,0",weight:"5 605"},
];
import {INITIAL_JOINTS,type MotionCommand} from "./crane-kinematics";
export type CranePose = MotionCommand;
export const DEFAULT_POSE: CranePose = {...INITIAL_JOINTS,mode:"sequence",deployment:58};
export const PRESETS = [ {name:"Repliée",value:0}, {name:"Au travail",value:58}, {name:"Déployée",value:100} ] as const;
