import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, RunInfo, CLASS_NAMES } from '../../../core/services/api.service';
import { interval, Subscription, switchMap, startWith } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';

export interface LogEntry {
    msg: string;
    count: number;
    time: string;
    type: 'info' | 'error' | 'success' | 'warn';
}

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
    logSub: Subscription | null = null;
    classNames = CLASS_NAMES;

    devLogs: LogEntry[] = [];

    sysInfo: any = null;

    constructor(private api: ApiService, private toast: ToastService) { }

    ngOnInit() {
        // Fetch System Info
        this.api.getSystemInfo().subscribe(res => {
            this.sysInfo = res;
        });

        // Poll runs every 5 seconds
        this.pollSub = interval(5000).pipe(
            startWith(0),
            switchMap(() => this.api.getRuns())
        ).subscribe({
            next: (res) => {
                if (res.status === 'success') {
                    if (this.runs.length > 0) {
                        const newLatest = res.runs.find(r => r.kind === 'current') || res.runs[0] || null;
                        const oldLatest = this.latestRun;
                        if (res.runs.length > this.runs.length) {
                            this.toast.show('New Training Run Started', 'info');
                        }
                        if (newLatest && oldLatest && newLatest.name !== oldLatest.name) {
                            this.toast.show(`Model switched to ${newLatest.name}`, 'success');
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
