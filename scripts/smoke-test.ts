const response = await executeRuntime({
  question: "What are the top 10 hospitals by patient satisfaction?",
  domain: "healthcare",
});

console.log(response);