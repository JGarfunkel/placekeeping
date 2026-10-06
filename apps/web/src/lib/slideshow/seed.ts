// Seeds one random-order shuffle so every page of it comes from the same
// ordering. Kept out of components, which must stay pure during render.
export function makeShuffleSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
