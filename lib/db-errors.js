export class DatabaseConfigurationError extends Error {
  constructor(message = "StarJar storage is not configured for this deployment.") {
    super(message);
    this.name = "DatabaseConfigurationError";
    this.code = "DATABASE_NOT_CONFIGURED";
  }
}

export class DuplicateEmailError extends Error {
  constructor() {
    super("An account with that email already exists.");
    this.name = "DuplicateEmailError";
    this.code = "DUPLICATE_EMAIL";
  }
}

export class PomodoroConflictError extends Error {
  constructor() {
    super("This session ID was already used for a different timer.");
    this.name = "PomodoroConflictError";
    this.code = "POMODORO_SESSION_CONFLICT";
  }
}
