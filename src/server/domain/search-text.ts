/**
 * A fórmula do índice de busca, isolada de propósito.
 *
 * `buildSearchText` é a única definição do que entra na coluna `searchText`, e
 * este arquivo não importa banco nem ambiente. Assim o seed, os testes e o
 * runtime constroem o índice pela mesma função — um índice montado por duas
 * fórmulas parecidas é a pior espécie de bug de busca, porque ele funciona
 * quase sempre.
 */
import { normalizeText, styleSearchText } from "./styles";

/** Teto de tamanho: um LIKE sobre texto ilimitado degrada sem avisar. */
const MAX_INDEX_CHARS = 4000;

export function buildSearchText(input: {
  name: string;
  subtitle?: string | null;
  description: string;
  garmentType: string;
  category: string;
  styleIds: readonly string[];
}): string {
  return normalizeText(
    [
      input.name,
      input.subtitle ?? "",
      input.description,
      input.garmentType,
      input.category,
      styleSearchText(input.styleIds),
    ].join(" "),
  ).slice(0, MAX_INDEX_CHARS);
}
