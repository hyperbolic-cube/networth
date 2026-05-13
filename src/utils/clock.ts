let _mockDate: Date | null = null;

export function getNow(): Date {
  if (__DEV__ && _mockDate !== null) return _mockDate;
  return new Date();
}

export function getNowMs(): number {
  return getNow().getTime();
}

export function setMockDate(date: Date | null): void {
  if (!__DEV__) return;
  _mockDate = date;
}

export function getMockDate(): Date | null {
  if (!__DEV__) return null;
  return _mockDate;
}

export function advanceMockDate(deltaMs: number): void {
  setMockDate(new Date(getNow().getTime() + deltaMs));
}
