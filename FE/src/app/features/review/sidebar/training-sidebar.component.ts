import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, RunInfo, CLASS_NAMES } from '../../../core/services/api.service';
import { interval, Subscription, switchMap, startWith } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';

@Component({
    selector: 'app-training-sidebar',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './training-sidebar.component.html',
    styleUrls: ['./training-sidebar.component.scss']
})
export class TrainingSidebarComponent implements OnInit, OnDestroy {
    runs: RunInfo[] = [];
    latestRun: RunInfo | null = null;
    pollSub: Subscription | null = null;
    classNames = CLASS_NAMES;

    constructor(private api: ApiService, private toast: ToastService) { }

    ngOnInit() {
        // Poll every 5 seconds
        this.pollSub = interval(5000).pipe(
            startWith(0),
            switchMap(() => this.api.getRuns())
        ).subscribe({
            next: (res) => {
                if (res.status === 'success') {
                    // Check if we already have runs loaded.
                    if (this.runs.length > 0) {
                        const newLatest = res.runs.find(r => r.kind === 'current') || res.runs[0] || null;
                        const oldLatest = this.latestRun;

                        // Case 1: New run appeared (count increased)
                        if (res.runs.length > this.runs.length) {
                            this.toast.show('New Training Run Started', 'info');
                        }

                        // Case 2: Current run updated (mtime changed significantly)
                        // Note: During training mtime updates frequently. We ideally want to know when it *finishes*.
                        // But polling 'runs' endpoint doesn't give "status: finished".
                        // However, if we track "training" state, we could infer.
                        // For now, simpler approach: if mtime changed by more than 1 min from previous check? No.
                        // Let's just update the list. The user asked for "Completion Notification".
                        // Use a simple heuristic: If we previously had a run, and its mtime changed, and we were not "training" locally?
                        // Actually, if using shared service, we could know.

                        // Let's try to detect if 'current' run changed.
                        if (newLatest && oldLatest) {
                            if (newLatest.name !== oldLatest.name) {
                                this.toast.show(`Model switched to ${newLatest.name}`, 'success');
                            } else if (newLatest.mtime > oldLatest.mtime) {
                                // existing model updated
                                // this.toast.show('Model Updated', 'info'); // This might be too spammy during training
                            }
                        }
                    }

                    this.runs = res.runs;
                    this.latestRun = this.runs.find(r => r.kind === 'current') || this.runs[0] || null;
                }
            },
            error: (err) => console.error('Polling failed', err)
        });
    }

    ngOnDestroy() {
        if (this.pollSub) this.pollSub.unsubscribe();
    }

    formatMetric(val: number | undefined, digits = 1): string {
        if (val === undefined || val === null) return '-';
        return val.toFixed(digits > 2 ? digits : 2);
    }

    formatTime(ts: number): string {
        if (!ts) return '';
        const date = new Date(ts * 1000);
        // Short format: "Jan 01 10:30"
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}
