import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {DSLInputComponent} from './component/dsl-input/dsl-input.component';
import {DropdownComponent} from './component/dropdown/dropdown.component';

@NgModule({
  imports: [CommonModule, FormsModule],
  declarations: [DSLInputComponent, DropdownComponent],
  exports: [DSLInputComponent]
})
export class DSLInputModule {
}
