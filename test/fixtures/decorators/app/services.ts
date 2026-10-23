import { Factory, inject } from "@huuma/inject";

export const DI = new Factory();

// Decorated classes register themselves with their dependencies through
// decorator metadata.
@inject()
export class Greeter {
  greet(name: string): string {
    return `Hello ${name}`;
  }
}

@inject({ deps: [Greeter] })
export class Welcome {
  constructor(private greeter: Greeter) {}

  message(): string {
    return this.greeter.greet("decorators");
  }
}
