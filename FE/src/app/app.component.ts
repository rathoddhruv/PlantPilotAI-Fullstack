import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { TrainingSidebarComponent } from './features/review/sidebar/training-sidebar.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { LogPanelComponent } from './shared/log-panel/log-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, TrainingSidebarComponent, ToastComponent, LogPanelComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'plant-pilot';
}
