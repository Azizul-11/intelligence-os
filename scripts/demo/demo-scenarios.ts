// demo-scenarios.ts contains only data (questions, parameters, expectations).


export interface DemoScenario {
  name: string;
  question: string;
  parameters: Record<string, unknown>;
  shouldResolve: boolean;
  shouldExecute: boolean;
}

export const demoScenarios: readonly DemoScenario[] = [
  {
    name: "Hospital Overall Rating",
    question: "hospital overall rating",
    parameters: {
      hospitalId: "010055",
    },
    shouldResolve: true,
    shouldExecute: true,
  },

  {
    name: "Readmission Rate",
    question: "readmission",
    parameters: {
      hospitalId: "010055",
    },
    shouldResolve: true,
    shouldExecute: true,
  },

  {
  name: "Mortality Rate",
  question: "mortality",
  parameters: {
    hospitalId: "010055",
  },
  shouldResolve: true,
  shouldExecute: true,
},

  {
    name: "Patient Experience",
    question: "patient experience",
    parameters: {
      hospitalId: "010055",
    },
    shouldResolve: true,
    shouldExecute: true,
  },

  {
    name: "Invalid Query",
    question: "banana pizza",
    parameters: {},
    shouldResolve: false,
    shouldExecute: false,
  },
];