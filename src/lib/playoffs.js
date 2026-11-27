// The playoff field and bracket, from the ranked standings (pure; tested in tests/playoffs-lib.test.js).
//
// league.settings.playoffSpots is the bracket size. With a wild card (playInRacers ≥ 2), the top
// playoffSpots − 1 go straight in and the next playInRacers race a play-in for the last spot: they all race
// the same cup(s) together and the highest total takes the wild card, seeded last. If there aren't at least
// two players left for the play-in, the top playoffSpots are simply in.

// Standard seeding order: 1 v 8, 4 v 5, 2 v 7, 3 v 6, …
export function bracketOrder(n) {
  let order = [1];
  while (order.length < n) {
    const m = order.length * 2;
    order = order.flatMap((s) => [s, m + 1 - s]);
  }
  return order;
}

export function roundName(matches) {
  return matches === 1 ? "Final" : matches === 2 ? "Semifinals" : matches === 4 ? "Quarterfinals" : `Round of ${matches * 2}`;
}

export function playoffFormat(L) {
  const spots = Math.max(2, Number(L.playoffSpots) || 4);
  const field = Math.max(0, Math.floor(Number(L.playInRacers) || 0));
  return { spots, playInRacers: field >= 2 ? field : 0, perRound: Math.max(1, Number(L.playoffCupsPerRound) || 1) };
}

// ranked: standings rows in rank order. Returns
//   direct  – rows that are in outright
//   playIn  – rows racing for the wild card ([] when there's no play-in)
//   bubble  – the next few rows outside the field
//   slots   – bracket seeds 1..n as { seed, s, note } (the wild card is { seed, s: null, note: "Wild card" })
//   rounds  – [[slotA, slotB], …] per round; first-round byes are hidden, later rounds show byes advancing
//   size    – bracket size (a power of two, 0 when there's no bracket)
export function playoffPicture(ranked, L) {
  const { spots, playInRacers } = playoffFormat(L);
  const contenders = playInRacers ? ranked.slice(spots - 1, spots - 1 + playInRacers) : [];
  const playIn = contenders.length >= 2 ? contenders : [];
  const direct = ranked.slice(0, playIn.length ? spots - 1 : spots);
  const fieldEnd = direct.length + playIn.length;
  const bubble = ranked.slice(fieldEnd, fieldEnd + 3);

  const slots = direct.map((s, i) => ({ seed: i + 1, s, note: null }));
  if (playIn.length) slots.push({ seed: spots, s: null, note: "Wild card" });

  const n = slots.length;
  const size = n >= 2 ? 2 ** Math.ceil(Math.log2(n)) : 0;
  const rounds = [];
  if (size) {
    const order = bracketOrder(size);
    const slot = (seed) => slots[seed - 1] || { seed: null, s: null, note: "Bye" };
    let current = [];
    for (let i = 0; i < size; i += 2) current.push([slot(order[i]), slot(order[i + 1])]);
    rounds.push(current);
    while (current.length > 1) {
      const next = [];
      for (let i = 0; i < current.length; i += 2) {
        const adv = (mt) => (mt[1].note === "Bye" ? mt[0] : mt[0].note === "Bye" ? mt[1] : { seed: null, s: null, note: "TBD" });
        next.push([adv(current[i]), adv(current[i + 1])]);
      }
      current = next;
      rounds.push(current);
    }
    // A first-round "match" against a bye isn't played; hide it.
    rounds[0] = rounds[0].filter((mt) => mt[0].note !== "Bye" && mt[1].note !== "Bye");
  }
  return { direct, playIn, bubble, slots, rounds, size, byes: size - n };
}
