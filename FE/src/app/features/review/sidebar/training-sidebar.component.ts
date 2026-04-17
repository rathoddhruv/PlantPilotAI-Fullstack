import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, RunInfo } from '../../../core/services/api.service';

@Component({
    selector: 'app-training-sidebar',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="w-full bg-gray-900 border-r border-gray-800 p-6 flex flex-col h-full text-gray-300">
      <!-- Header -->
      <div class="mb-8">
        <h2 class="text-xl font-bold text-white mb-1 uppercase tracking-tighter italic whitespace-nowrap">Neural History</h2>
        <p class="text-[10px] text-gray-500 font-mono font-bold uppercase tracking-widest">Version Repository</p>
      </div>

      <!-- Core History Sidebar -->
      <div class="flex-1 overflow-y-auto pr-1 custom-scrollbar">
        <div class="space-y-3">
          <div *ngFor="let run of runs" class="rounded-xl border transition-all overflow-hidden"
               [class.border-indigo-500/30]="run.kind === 'current'"
               [class.bg-indigo-500/5]="run.kind === 'current'"
               [class.border-gray-800]="run.kind !== 'current'"
               [class.bg-gray-800/30]="run.kind !== 'current'">
            
            <!-- Summary Header (Date & Arrow) -->
            <div class="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 transition-colors"
                 (click)="toggleRun(run.name)">
               <div class="flex items-center gap-3">
                  <span class="text-[10px] font-black tracking-widest text-white/90">
                    {{ run.mtime * 1000 | date:'MMM d h:mm a' }}
                  </span>
                  <span *ngIf="run.kind === 'current'" class="text-[7px] bg-indigo-500 text-white px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter">Live</span>
               </div>
               <span class="text-gray-600 text-xs transition-transform duration-300" 
                     [class.rotate-180]="expandedRuns.has(run.name)">▼</span>
            </div>

            <!-- Expanded Stats -->
            <div *ngIf="expandedRuns.has(run.name)" class="px-3 pb-4 pt-0 border-t border-gray-800/50">
               <div class="grid grid-cols-1 gap-2 py-3">
                  <div class="flex justify-between items-end border-b border-gray-800/20 pb-1">
                     <span class="text-[9px] font-bold text-gray-500 uppercase tracking-widest">mAP</span>
                     <span class="text-xs font-mono font-black text-indigo-400">{{ (run.metrics?.map50 || 0).toFixed(2) }}</span>
                  </div>
                  <div class="flex justify-between items-end border-b border-gray-800/20 pb-1">
                     <span class="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Prec</span>
                     <span class="text-xs font-mono font-black text-white">{{ (run.metrics?.precision || 0).toFixed(2) }}</span>
                  </div>
                  <div class="flex justify-between items-end border-b border-gray-800/20 pb-1">
                     <span class="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Rec</span>
                     <span class="text-xs font-mono font-black text-white">{{ (run.metrics?.recall || 0).toFixed(2) }}</span>
                  </div>
               </div>
               
               <button *ngIf="run.kind !== 'current'" (click)="rollback(run.name)"
                       class="w-full mt-2 py-1.5 text-[8px] font-black uppercase border border-gray-700 rounded-lg hover:bg-white/10 hover:text-white text-gray-500 transition-all tracking-widest">
                 Rollback to this
               </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Settings / Maintenance -->
      <div class="mt-8 pt-6 border-t border-gray-800 space-y-2">
        <button (click)="resetProject(true)" 
                class="w-full py-2 bg-gray-800/30 border border-gray-700/50 rounded-xl flex items-center justify-center gap-2 text-[8px] font-black uppercase tracking-widest text-gray-500 hover:text-blue-400 transition-all">
          <span>📦</span> Archive
        </button>
        <button (click)="resetProject(false)" 
                class="w-full py-2 bg-gray-800/30 border border-gray-700/50 rounded-xl flex items-center justify-center gap-2 text-[8px] font-black uppercase tracking-widest text-gray-500 hover:text-red-400 transition-all">
          <span>🔥</span> Wipe
        </button>
      </div>

    </div>
  `
})
export class TrainingSidebarComponent implements OnInit {
    @Input() runs: RunInfo[] = [];
    expandedRuns = new Set<string>();

    constructor(private api: ApiService) { }

    ngOnInit() { }

    toggleRun(name: string) {
        if (this.expandedRuns.has(name)) {
            this.expandedRuns.delete(name);
        } else {
            this.expandedRuns.add(name);
        }
    }

    rollback(runName: string) {
        if (!confirm(`Rollback to build ${runName}?`)) return;
        this.api.rollback(runName).subscribe({
            next: () => alert('Rollback successful. Model updated.'),
            error: (e) => alert('Rollback failed: ' + e.message)
        });
    }

    resetProject(archive: boolean = true) {
        if (!confirm(archive ? 'Archive project and start fresh?' : 'PERMANENTLY WIPE ENVIRONMENT?')) return;
        this.api.resetProject(archive).subscribe({
            next: () => window.location.reload(),
            error: (e) => alert('Operation failed: ' + e.message)
        });
    }
}
