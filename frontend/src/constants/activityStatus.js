/**
 * Status de andamento de uma atividade. Usado no formulário, no card da tela
 * e no badge do PowerPoint — por isso vive num módulo próprio, para que rótulo
 * e cor não divirjam entre os lugares.
 */
export const ACTIVITY_STATUS = [
  { value: "done", label: "Concluído", color: "6FD898", dot: "🟢" },
  { value: "doing", label: "Em andamento", color: "E8C96A", dot: "🟡" },
  { value: "validating", label: "Em validação", color: "5A7BFF", dot: "🔵" },
  { value: "blocked", label: "Bloqueado", color: "FF8D97", dot: "🔴" },
];

export const DEFAULT_ACTIVITY_STATUS = "done";

export function getActivityStatus(value) {
  return (
    ACTIVITY_STATUS.find((item) => item.value === String(value || "")) ||
    ACTIVITY_STATUS.find((item) => item.value === DEFAULT_ACTIVITY_STATUS)
  );
}
