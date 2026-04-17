import { Component, HostListener } from '@angular/core';
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
  isConsoleVisible = false;

  // Splitter State
  sidebarWidth = 320;
  consoleHeight = 300;
  isResizingSidebar = false;
  isResizingConsole = false;

  toggleConsole() {
    this.isConsoleVisible = !this.isConsoleVisible;
  }

  // --- Splitter Logic ---
  startResizingSidebar(event: MouseEvent) {
    event.preventDefault();
    this.isResizingSidebar = true;
  }

  startResizingConsole(event: MouseEvent) {
    event.preventDefault();
    this.isResizingConsole = true;
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.isResizingSidebar) {
      // Sidebar width is relative to left side
      const newWidth = event.clientX;
      if (newWidth > 200 && newWidth < 600) {
        this.sidebarWidth = newWidth;
      }
    }

    if (this.isResizingConsole) {
      // Console height is relative to bottom
      const newHeight = window.innerHeight - event.clientY;
      if (newHeight > 40 && newHeight < 800) {
        this.consoleHeight = newHeight;
      }
    }
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    this.isResizingSidebar = false;
    this.isResizingConsole = false;
  }
}
