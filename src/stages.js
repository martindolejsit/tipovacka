export const stageOptions = [
  {
    value: 'regular',
    label: 'Základní část',
    order: 1,
  },
  {
    value: 'title',
    label: 'Skupina o titul',
    order: 2,
  },
  {
    value: 'middle',
    label: 'Skupina o umístění',
    order: 3,
  },
  {
    value: 'relegation',
    label: 'Skupina o záchranu',
    order: 4,
  },
]

export const stageLabels = Object.fromEntries(
  stageOptions.map((stage) => [stage.value, stage.label])
)

export function getStageOrder(stage) {
  return (
    stageOptions.find((item) => item.value === stage)?.order ??
    999
  )
}