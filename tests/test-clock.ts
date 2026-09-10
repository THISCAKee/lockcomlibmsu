export class ManualClock {
  constructor(private current = new Date('2026-09-10T08:00:00.000Z')) {}

  now() {
    return new Date(this.current);
  }

  advance(milliseconds: number) {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
