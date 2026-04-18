import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, RunInfo } from '../../../core/services/api.service';
import { ReviewQueueService } from '../../../core/services/review-queue.service';
import { interval, Subscription, startWith, switchMap } from 'rxjs';

@Component({
  selector: 'app-training-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="w-full bg-[#1e293b] flex flex-col h-full text-slate-300 border-r border-slate-800 shadow-2xl overflow-hidden">
      <!-- Branding Area -->
      <div class="p-6 pb-2 border-b border-slate-800/50 bg-[#0f172a]/20">
        <h2 class="text-xl font-black text-white mb-1 uppercase tracking-tighter italic whitespace-nowrap">TrainFlow Vision</h2>
        <p class="text-[9px] text-slate-500 font-mono font-bold uppercase tracking-widest leading-tight">Neural Control Center v11</p>
      </div>

      <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
        
        <!-- Environment Status -->
        <section>
          <div class="flex items-center gap-3 mb-4">
             <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
             <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Environment Live</h3>
          </div>
          <div class="bg-slate-900/40 rounded-2xl p-4 border border-slate-700/30 space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-slate-500 font-bold uppercase text-[9px]">Acceleration</span>
              <span [class.text-indigo-400]="sysInfo?.cuda_available" 
                    [class.text-orange-500]="!sysInfo?.cuda_available"
                    class="font-mono font-black text-[10px]">{{ sysInfo?.cuda_available ? 'CUDA ⚡' : 'CPU 🐢' }}</span>
            </div>
            <div *ngIf="sysInfo && !sysInfo.cuda_available" class="p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
               <p class="text-[8px] text-red-400 font-black uppercase tracking-widest text-center leading-none">⚠️ GPU FALLBACK ACTIVE</p>
            </div>
            <div class="flex justify-between items-center gap-2">
              <span class="text-slate-500 font-bold uppercase text-[9px]">Compute</span>
              <span class="text-blue-300 font-mono text-[9px] font-bold truncate text-right">{{ sysInfo?.device_name || 'Loading...' }}</span>
            </div>
          </div>
        </section>

        <!-- Maintenance Dock -->
        <section>
          <h3 class="text-[10px] font-black text-slate-500 uppercase mb-3 tracking-widest border-b border-slate-800 pb-2">Maintenance Dock</h3>
          <div class="space-y-2">
             <button (click)="onAction('archive')" class="w-full flex items-center justify-between px-3 py-2 bg-slate-800/30 hover:bg-slate-800/60 border border-slate-700/50 rounded-xl text-left transition-all group">
                <div class="flex items-center gap-3">
                   <span class="text-xs">📦</span>
                   <div class="flex flex-col">
                      <span class="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Archive Project</span>
                      <span class="text-[8px] text-slate-500 font-bold uppercase tracking-tighter">Safe Reset</span>
                   </div>
                </div>
             </button>

             <button (click)="onAction('wipe')" class="w-full flex items-center justify-between px-3 py-2 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl text-left transition-all group">
                <div class="flex items-center gap-3">
                   <span class="text-xs">☢️</span>
                   <div class="flex flex-col">
                      <span class="text-[10px] font-bold text-red-500 uppercase tracking-wider">Full Environment Wipe</span>
                      <span class="text-[8px] text-red-700/60 font-black uppercase tracking-tighter">Total Purge</span>
                   </div>
                </div>
             </button>
          </div>
        </section>

        <!-- Neural History -->
        <section>
          <h3 class="text-[10px] font-black text-slate-500 uppercase mb-3 tracking-widest border-b border-slate-800 pb-2">Neural History</h3>
          <div class="space-y-2">
            <div *ngFor="let run of runs" class="rounded-xl border transition-all overflow-hidden"
                 [ngClass]="run.kind === 'current' ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-slate-800 bg-slate-800/20'">
              
              <div class="flex items-start justify-between p-3 cursor-pointer group" (click)="toggleRun(run.name)">
                 <div class="flex items-center gap-2">
                    <div class="flex flex-col">
                      <span class="text-[9px] font-mono font-black text-indigo-400/70 uppercase tracking-tighter">{{ run.name }}</span>
                      <span class="text-[10px] font-black tracking-widest text-slate-100/90 whitespace-nowrap">{{ run.mtime * 1000 | date:'MMM d, h:mm a' }}</span>
                    </div>
                 </div>
                 <div *ngIf="run.kind === 'current'" class="text-[7px] bg-indigo-500 text-white px-1.5 py-0.5 rounded font-black uppercase shadow-lg">Live</div>
              </div>

              <div class="px-3 pb-3 pt-0 flex flex-col gap-2">
                 <div class="flex justify-between items-center text-[10px] font-mono border-t border-slate-800/30 pt-2">
                    <span class="text-slate-500 font-bold uppercase text-[8px]">Precision</span>
                    <span class="text-indigo-400 font-black tracking-tighter">{{ (run.metrics.precision || 0).toFixed(2) }}</span>
                 </div>
                 
                 <div class="flex gap-2 mt-1">
                    <button *ngIf="run.kind !== 'current'" (click)="onAction('rollback', run.name)"
                            class="flex-1 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded text-[8px] font-black uppercase tracking-widest transition-all">
                      RESTORE
                    </button>
                 </div>
              </div>
            </div>

            <div *ngIf="runs.length === 0" class="py-12 flex flex-col items-center justify-center text-slate-600 opacity-40">
               <span class="text-2xl mb-2">📜</span>
               <p class="text-[9px] font-black uppercase tracking-widest text-center">No Neural Fingerprints Found</p>
            </div>
          </div>
        </section>
      </div>

      <!-- Footer Info -->
      <div class="p-4 border-t border-slate-800 bg-[#0f172a]/40 text-[8px] font-black text-slate-700 flex justify-between uppercase tracking-[0.2em]">
         <span>Node: Win32</span>
         <span>Runs: {{ runs.length }}</span>
      </div>
    </div>
  `
})
export class TrainingSidebarComponent implements OnInit, OnDestroy {
  public runs: RunInfo[] = [];
  public sysInfo: any = null;
  public expandedRuns = new Set<string>();
  private statusSub: Subscription | null = null;

  constructor(
    private api: ApiService,
    private reviewQueue: ReviewQueueService
  ) {}

  ngOnInit() {
    this.refreshData();
    // Sub-polling for system health, but keep it slow (10s) to satisfy "Low Chatter" requirements
    this.statusSub = interval(10000).pipe(
      startWith(0),
      switchMap(() => this.api.getSystemInfo())
    ).subscribe(res => {
      this.sysInfo = res;
      // Also refresh runs when sidebar initializes
      this.api.getRuns().subscribe(r => this.runs = r.runs);
    });
  }

  ngOnDestroy() {
    if (this.statusSub) this.statusSub.unsubscribe();
  }

  refreshData() {
    this.api.getSystemInfo().subscribe(res => this.sysInfo = res);
    this.api.getRuns().subscribe(res => this.runs = res.runs);
  }

  public toggleRun(name: string) {
    if (this.expandedRuns.has(name)) {
      this.expandedRuns.delete(name);
    } else {
      this.expandedRuns.add(name);
    }
  }

  public onAction(type: 'archive' | 'wipe' | 'rollback', targetName?: string) {
    if (type === 'archive') {
      if (!confirm('ARCHIVE PROJECT: Move current dataset and runs to history?')) return;
      this.executeReset(true);
    } else if (type === 'wipe') {
      if (!confirm('🚨 NUCLEAR WIPE: Irreversibly delete ALL history, datasets, and models?')) return;
      this.executeReset(false);
    } else if (type === 'rollback' && targetName) {
      if (!confirm(`Restore model to ${targetName}?`)) return;
      this.api.rollback(targetName).subscribe({
        next: () => {
          this.refreshData();
          window.location.reload(); // Refresh whole app to update model state
        },
        error: (e) => alert('Restore Failed: ' + e.message)
      });
    }
  }

  private executeReset(archive: boolean) {
    this.api.resetProject(archive).subscribe({
      next: () => {
        this.reviewQueue.clear();
        this.refreshData();
        window.location.reload(); // Hard refresh to clear all states
      },
      error: (e) => alert('Action Failed: ' + e.message)
    });
  }
}
