export function blank() {
  console.log("");
}

export function line() {
  console.log("----------------------------------------");
}

export function title(text: string) {
  blank();
  console.log(text);
  line();
}

export function info(label: string, value: unknown) {
  console.log(`${label}: ${value}`);
}

export function success(text: string) {
  console.log(`✓ ${text}`);
}

export function failure(text: string) {
  console.log(`✗ ${text}`);
}