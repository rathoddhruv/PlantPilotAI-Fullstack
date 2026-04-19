import { createFeatureSelector, createSelector } from '@ngrx/store';
import { BatchState, TrainingState } from './app.state';

// Feature Selectors
export const selectBatchState = createFeatureSelector<BatchState>('batch');
export const selectTrainingState = createFeatureSelector<TrainingState>('training');

// Batch Selectors
export const selectBatchQueue = createSelector(
    selectBatchState,
    (state: BatchState) => state.queue
);

export const selectBatchQueueSize = createSelector(
    selectBatchState,
    (state: BatchState) => state.queue.length
);

export const selectBatchStatus = createSelector(
    selectBatchState,
    (state: BatchState) => state.status
);

export const selectBatchIsProcessing = createSelector(
    selectBatchState,
    (state: BatchState) => state.isProcessing
);

export const selectBatchMaxSize = createSelector(
    selectBatchState,
    (state: BatchState) => state.maxBatchSize
);

export const selectBatchReadyToTrain = createSelector(
    selectBatchQueueSize,
    (size) => size > 0
);

// Training Selectors
export const selectIsTraining = createSelector(
    selectTrainingState,
    (state: TrainingState) => state.isTraining
);

export const selectTrainingProgress = createSelector(
    selectTrainingState,
    (state: TrainingState) => state.progress
);

export const selectTrainingLogs = createSelector(
    selectTrainingState,
    (state: TrainingState) => state.logs
);

export const selectTrainingError = createSelector(
    selectTrainingState,
    (state: TrainingState) => state.error
);

export const selectTrainingRuns = createSelector(
    selectTrainingState,
    (state: TrainingState) => state.runs
);

export const selectCurrentTrainingRun = createSelector(
    selectTrainingState,
    (state: TrainingState) => state.currentRun
);

export const selectTrainingStartTime = createSelector(
    selectTrainingState,
    (state: TrainingState) => state.startTime
);

// Combined Selectors
export const selectIsAnyProcessing = createSelector(
    selectIsTraining,
    selectBatchIsProcessing,
    (training, batch) => training || batch
);
