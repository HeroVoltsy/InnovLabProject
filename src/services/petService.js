export const PET_STAGES = [
  { name: 'Kitten Sprout', min: 0, max: 2 },
  { name: 'Kitten', min: 3, max: 9 },
  { name: 'Young Cat', min: 10, max: 24 },
  { name: 'Grown Cat', min: 25, max: 49 },
  { name: 'Max Cat', min: 50, max: Infinity },
]

const STORAGE_KEY = 'pondo_saves'

export function getSaveCount() {
  try {
    return Math.max(0, Number.parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0)
  } catch (error) {
    console.error('Could not read Pondo progress from localStorage.', error)
    return 0
  }
}

export function incrementSaveCount() {
  const count = getSaveCount() + 1
  try {
    localStorage.setItem(STORAGE_KEY, String(count))
  } catch (error) {
    console.error('Could not persist Pondo progress to localStorage.', error)
  }
  return count
}

export function getPetStage(count) {
  return PET_STAGES.find((stage) => count >= stage.min && count <= stage.max) || PET_STAGES[0]
}
