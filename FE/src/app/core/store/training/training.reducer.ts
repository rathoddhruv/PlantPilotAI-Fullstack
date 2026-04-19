import { createReducer, on } from '@ngrx/store';
import { TrainingState } from '../app.state';
import * as TrainingActions from './training.actions';

export const initialState: TrainingState = {
    isTraining: false,
    currentRun: null,
    runs: [],
    progress: 0,
    logs: [],
    error: null,
    startTime: null
};

export const trainingReducer = createReducer(
    initialState,

    // Start Training
    on(TrainingActions.startTraining, (state) => ({
        ...state,
        isTraining: true,
        progress: 0,
        logs: [],
        error: null,
        startTime: new Date()
    })),

    on(TrainingActions.startTrainingSuccess, (state) => ({
        ...state,
        isTraining: true
    })),

    on(TrainingActions.startTrainingFailure, (state, { error }) => ({
        ...state,
        isTraining: false,
        error,
        progress: 0
    })),

    // Poll Logs
    on(TrainingActions.pollTrainingLogsSuccess, (state, { logs, progress, isComplete }) => ({
        ...state,
        logs,
        progress,
        isTraining: !isComplete
    })),

    on(TrainingActions.pollTrainingLogsFailure, (state, { error }) => ({
        ...state,
        error
    })),

    // Get Runs
    on(TrainingActions.getTrainingRunsSuccess, (state, { runs }) => {
        const currentRun = runs.find(r => r.kind === 'current') || null;
        return {
            ...state,
            runs,
            currentRun
        };
    }),

    on(TrainingActions.getTrainingRunsFailure, (state, { error }) => ({
        ...state,
        error
    })),

    // Reset
    on(TrainingActions.resetTrainingState, () => initialState)
);
