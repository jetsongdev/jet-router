export async function deliver(attempt, clock) {
  for (let number = 1; number <= 3; number++) {
    try {
      return await attempt();
    } catch (error) {
      if (!error.retryable || number === 3) throw error;
      await clock.sleep(error.delay);
    }
  }
}
