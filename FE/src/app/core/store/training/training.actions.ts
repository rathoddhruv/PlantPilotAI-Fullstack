import { createAction, props } from '@ngrx/store';
import { TrainingRun } from '../app.state';

// Start Training
export const startTraining = createAction(
    '[Training] Start Training',
    props<{ epochs?: number; imgsz?: number; model?: string }>()
);

export const startTrainingSuccess = createAction(
    '[Training] Start Training Success'
);

export const startTrainingFailure = createAction(
    '[Training] Start Training Failure',
    props<{ error: string }>()
);

// Poll Training Logs
export const pollTrainingLogs = createAction(
    '[Training] Poll Logs'
);

export const pollTrainingLogsSuccess = createAction(
    '[Training] Poll Logs Success',
    props<{ logs: string[]; isComplete: boolean; progress: number }>()
);

export const pollTrainingLogsFailure = createAction(
    '[Training] Poll Logs Failure',
    props<{ error: string }>()
);

// Get Runs
export const getTrainingRuns = createAction(
    '[Training] Get Runs'
);

export const getTrainingRunsSuccess = createAction(
    '[Training] Get Runs Success',
    props<{ runs: TrainingRun[] }>()
);

export const getTrainingRunsFailure = createAction(
    '[Training] Get Runs Failure',
    props<{ error: string }>()
);

// Stop Polling
export const stopTrainingPolling = createAction(
    '[Training] Stop Polling'
);

// Reset Training State
export const resetTrainingState = createAction(
    '[Training] Reset State'
);
