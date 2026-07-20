/**
 * Status de andamento de uma atividade. Usado no formulário, no card da tela
 * e no badge do PowerPoint — por isso vive num módulo próprio, para que rótulo
 * e cor não divirjam entre os lugares.
 */
// `tint` é a cor do status já composta sobre o painel escuro: PPT e PDF não
// têm alpha confiável, então a cápsula usa um hex sólido no lugar da opacidade.
export const ACTIVITY_STATUS = [
  { value: "done", label: "Concluído", color: "6FD898", tint: "1B2B2A", dot: "🟢" },
  { value: "doing", label: "Em andamento", color: "E8C96A", tint: "2C2924", dot: "🟡" },
  { value: "validating", label: "Em validação", color: "5A7BFF", tint: "181E38", dot: "🔵" },
  { value: "blocked", label: "Bloqueado", color: "FF8D97", tint: "2F212A", dot: "🔴" },
];

export const DEFAULT_ACTIVITY_STATUS = "done";

export function getActivityStatus(value) {
  return (
    ACTIVITY_STATUS.find((item) => item.value === String(value || "")) ||
    ACTIVITY_STATUS.find((item) => item.value === DEFAULT_ACTIVITY_STATUS)
  );
}
