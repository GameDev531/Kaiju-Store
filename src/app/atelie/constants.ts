/**
 * Constants shared between the atelier's server actions and its UI.
 *
 * They live here rather than in actions.ts because a "use server" module may
 * only export async functions — every other export in such a file becomes a
 * remote-callable endpoint, which is why Next refuses it.
 */

/** The quality checklist. Fixed and measurable — no free-form "looks fine". */
export const QC_CHECKLIST = [
  { key: "measurements", label: "Medidas conferidas contra a ficha, dentro da tolerância" },
  { key: "seams", label: "Costuras firmes, sem pontos soltos ou falhados" },
  { key: "finishing", label: "Acabamento interno limpo, sem fios pendurados" },
  { key: "symmetry", label: "Simetria conferida (mangas, bolsos, recortes)" },
  { key: "hardware", label: "Zíperes, botões e aviamentos funcionando" },
  { key: "print", label: "Estampa/bordado alinhado e sem falhas" },
  { key: "fabric", label: "Tecido sem manchas, furos ou marcas de máquina" },
  { key: "pressing", label: "Peça passada e pronta para embalar" },
] as const;

/** What an atelier can declare it does. Drives the matcher's hard filters. */
export const SPECIALIZATION_OPTIONS = [
  { value: "GARMENT:TOPS", label: "Camisetas e tops" },
  { value: "GARMENT:OUTERWEAR", label: "Jaquetas e casacos" },
  { value: "GARMENT:BOTTOMS", label: "Calças e shorts" },
  { value: "GARMENT:DRESSES", label: "Vestidos e conjuntos" },
  { value: "GARMENT:KNITWEAR", label: "Tricô e moletom" },
  { value: "GARMENT:ACCESSORIES", label: "Acessórios" },
  { value: "TECHNIQUE:EMBROIDERY", label: "Bordado" },
  { value: "TECHNIQUE:PRINTING", label: "Estamparia" },
  { value: "TECHNIQUE:THREE_D_PRINTING", label: "Impressão 3D" },
  { value: "MATERIAL:LEATHER", label: "Couro" },
  { value: "MATERIAL:KNIT", label: "Malha" },
  { value: "MATERIAL:TECHNICAL", label: "Tecidos técnicos" },
] as const;
