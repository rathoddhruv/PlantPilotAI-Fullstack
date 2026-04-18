import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, RunInfo } from '../../../core/services/api.service';

@Component({
  selector: 'app-dashboard-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="w-full bg-gray-900 border-r border-gray-800 p-6 flex flex-col h-full text-gray-300">
      <div class="mb-8">
        <h2 class="text-xl font-black text-white mb-1 uppercase tracking-tighter italic whitespace-nowrap">TrainFlow Vision</h2>
        <p class="text-[10px] text-gray-500 font-mono font-bold uppercase tracking-widest">Global Training & Refine Hub</p>
      </div>

      <div class="mb-8 bg-gray-800/40 rounded-2xl p-4 border border-gray-700/50">
        <div class="flex items-center gap-3 mb-4">
           <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
           <h3 class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Environment Live</h3>
        </div>
        <div class="space-y-2 text-xs">
          <div class="flex justify-between items-center">
            <span class="text-gray-500 font-bold uppercase text-[9px]">Acceleration</span>
            <span [class.text-indigo-400]="sysInfo?.cuda_available" 
                  [class.text-orange-500]="!sysInfo?.cuda_available"
                  [class.animate-pulse]="!sysInfo?.cuda_available"
                  class="font-mono font-bold">{{ sysInfo?.cuda_available ? 'CUDA ⚡' : 'CPU 🐢' }}</span>
          </div>
          <div *ngIf="sysInfo && !sysInfo.cuda_available" class="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
             <p class="text-[8px] text-red-400 font-black uppercase tracking-widest text-center">⚠️ GPU NOT DETECTED - TRAINING WILL BE SLOW</p>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-gray-500 font-bold uppercase text-[9px]">Compute Node</span>
            <span class="text-blue-300 font-mono text-[9px] font-bold truncate max-w-[100px]">{{ sysInfo?.device_name || 'Loading...' }}</span>
          </div>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto pr-1">
        <h3 class="text-[10px] font-black text-gray-500 uppercase mb-4 tracking-widest border-b border-gray-800 pb-2">Neural History</h3>
        
        <div class="space-y-2">
          <div *ngFor="let run of runs" class="rounded-xl border transition-all"
               [ngClass]="run.kind === 'current' ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-gray-800 bg-gray-800/30'">
            
            <div class="flex items-center justify-between p-3 cursor-pointer group" (click)="toggleRun(run.name)">
               <div class="flex items-center gap-2">
                  <div class="flex flex-col">
                    <span class="text-[9px] font-mono font-black text-indigo-400/70 uppercase tracking-tighter">{{ run.name }}</span>
                    <span class="text-[10px] font-black tracking-widest text-white/90">{{ run.mtime * 1000 | date:'MMM d h:mm a' }}</span>
                  </div>
                  <span *ngIf="run.kind === 'current'" class="text-[7px] bg-indigo-500 text-white px-1.5 py-0.5 rounded-full font-black uppercase">Live</span>
               </div>
               
               <div class="flex items-center gap-3">
                 <button *ngIf="run.kind !== 'current'" (click)="$event.stopPropagation(); rollback(run.name)"
                         class="px-2 py-1 bg-indigo-500/20 hover:bg-indigo-500 text-indigo-400 hover:text-white rounded text-[8px] font-black uppercase transition-all whitespace-nowrap">
                   RESTORE
                 </button>
                 <span class="text-gray-600 text-[10px] transition-transform" [class.rotate-180]="expandedRuns.has(run.name)">▼</span>
               </div>
            </div>

            <div *ngIf="expandedRuns.has(run.name)" class="px-3 pb-4 pt-0 border-t border-gray-800/50">
               <div class="grid grid-cols-1 gap-2 py-3">
                  <div class="flex justify-between items-end border-b border-gray-800/20 pb-1">
                     <span class="text-[9px] font-bold text-gray-400 uppercase">mAP</span>
                     <span class="text-xs font-mono font-black text-indigo-400">{{ (run.metrics.map50 || 0).toFixed(2) }}</span>
                  </div>
                  <div class="flex justify-between items-end border-b border-gray-800/20 pb-1">
                     <span class="text-[9px] font-bold text-gray-400 uppercase">Prec</span>
                     <span class="text-xs font-mono font-black text-white">{{ (run.metrics.precision || 0).toFixed(2) }}</span>
                  </div>
                  <div class="flex justify-between items-end border-b border-gray-800/20 pb-1">
                     <span class="text-[9px] font-bold text-gray-400 uppercase">Rec</span>
                     <span class="text-xs font-mono font-black text-white">{{ (run.metrics.recall || 0).toFixed(2) }}</span>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-auto pt-6 border-t border-gray-800 space-y-2">
        <h3 class="text-[9px] font-black text-gray-600 uppercase tracking-widest px-1 mb-2">System Maintenance</h3>
        <button (click)="resetProject(true)" 
                class="w-full py-2.5 bg-gray-800/30 border border-gray-700/50 rounded-xl flex items-center justify-center gap-2 text-[8px] font-black uppercase tracking-widest text-gray-500 hover:text-blue-400 hover:bg-blue-400/5 transition-all">
          <span>📦</span> Archive Project
        </button>
        <button (click)="resetProject(false)" 
                class="w-full py-2.5 bg-gray-800/30 border border-gray-700/50 rounded-xl flex items-center justify-center gap-2 text-[8px] font-black uppercase tracking-widest text-gray-500 hover:text-red-500 hover:bg-red-500/5 transition-all">
          <span>🔥</span> Full Environment Wipe
        </button>
      </div>
    </div>
  `
})
export class DashboardSidebarComponent implements OnInit {
  @Input() runs: RunInfo[] = [];
  @Input() manifest: any[] = [];
  
  public sysInfo: any = null;
  public expandedRuns = new Set<string>();

  constructor(private api: ApiService) { }

  ngOnInit() {
    this.api.getSystemInfo().subscribe(res => {
      this.sysInfo = res;
    });
  }

  public toggleRun(name: string) {
    if (this.expandedRuns.has(name)) {
      this.expandedRuns.delete(name);
    } else {
      this.expandedRuns.add(name);
    }
  }

  public rollback(runName: string) {
    if (!confirm(`Rollback to ${runName}?`)) return;
    this.api.rollback(runName).subscribe({
      next: () => alert('Rollback successful.'),
      error: (e) => alert('Error: ' + e.message)
    });
  }

  public resetProject(archive: boolean = true) {
    const msg = archive 
      ? "Archive project and start fresh?" 
      : "PERMANENT WIPE: Delete all models and data?";
    if (!confirm(msg)) return;
    this.api.resetProject(archive).subscribe({
      next: () => window.location.reload(),
      error: (e) => alert('Error: ' + e.message)
    });
  }
}
