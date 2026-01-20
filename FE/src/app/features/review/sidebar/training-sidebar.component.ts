import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, RunInfo } from '../../../core/services/api.service';
import { interval, Subscription, switchMap, startWith, forkJoin } from 'rxjs';
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
    classNames: string[] = [];

    devLogs: LogEntry[] = [];

    sysInfo: any = null;

    constructor(private api: ApiService, private toast: ToastService) { }

    ngOnInit() {
        this.fetchInfo();
        this.fetchClasses();

        // Poll runs AND system info every 5 seconds
        this.pollSub = interval(5000).pipe(
            startWith(0),
            switchMap(() => forkJoin({
                runs: this.api.getRuns(),
                info: this.api.getSystemInfo()
            }))
        ).subscribe({
            next: (res) => {
                this.processRuns(res.runs);
                this.sysInfo = res.info;
            },
            error: (err) => console.error('Polling error', err)
        });
    }

    fetchInfo() {
        this.api.getSystemInfo().subscribe(res => this.sysInfo = res);
    }

    fetchClasses() {
        this.api.getClasses().subscribe({
            next: (res) => {
                this.classNames = res.classes || [];
            },
            error: (err) => console.error("Failed to fetch classes", err)
        });
    }

    resetProject() {
        if (!confirm('Are you sure you want to RESET the project? This will delete all annotations/models.')) return;

        this.api.resetProject().subscribe({
            next: () => {
                this.toast.show('Project Reset Successful', 'success');
                this.fetchClasses(); // Update (empty) classes
                this.fetchInfo(); // Update (base) model
            },
            error: (err) => this.toast.show('Reset Failed', 'error')
        });
    }

    ngOnDestroy() {
        if (this.pollSub) this.pollSub.unsubscribe();
    }

    processRuns(res: any) {
        if (res.status === 'success') {
            if (this.runs.length > 0) {
                const newLatest = res.runs.find((r: any) => r.kind === 'current') || res.runs[0] || null;
                const oldLatest = this.latestRun;
                if (res.runs.length > this.runs.length) {
                    this.toast.show('New Training Run Started', 'info');
                }
                if (newLatest && oldLatest && newLatest.name !== oldLatest.name) {
                    // Optimized: Only show this if name changed significantly
                    this.toast.show(`Model switched to ${newLatest.name}`, 'success');
                }
            }
            this.runs = res.runs;
            this.latestRun = this.runs.find(r => r.kind === 'current') || this.runs[0] || null;
        }
    }

    formatMetric(val: number | undefined, digits = 1): string {
        if (val === undefined || val === null) return '-';
        return val.toFixed(digits > 2 ? digits : 2);
    }

    formatTime(ts: number): string {
        if (!ts) return '';
        const date = new Date(ts * 1000);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}
