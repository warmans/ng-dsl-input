import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Subscription} from 'rxjs/Subscription';
import 'rxjs/add/operator/debounceTime';
import {Statement, TokenConfig} from '../dsl-input/dsl-input.component';

@Component({
  selector: 'app-dropdown',
  templateUrl: './dropdown.component.html',
  styleUrls: ['./dropdown.component.scss'],
})
export class DropdownComponent implements OnInit {

  @Input()
  statement: Statement;

  @Input()
  tokenConf: TokenConfig;

  @Input()
  valueSourcePaging: boolean;

  @Input()
  keyboardEvents: EventEmitter<KeyboardEvent> = new EventEmitter<KeyboardEvent>();

  @Input()
  enableMultiselect: boolean;

  @Input()
  set filter(f: string) {
    this._filter = f;
    this.page = 0;
    this.filterChange.next(f);
  }
  get filter(): string {
    return this._filter;
  }

  @Input()
  pageSize: 10;

  @Output()
  onValue: EventEmitter<string[]> = new EventEmitter();

  valuesSelected: string[] = [];

  values: string[] = [];

  page = 0;

  focusedValue = 0;

  private _filter: string;

  // use a observable for filter changes to allow debouncing
  private filterChange: EventEmitter<string> = new EventEmitter();

  private valueSub: Subscription;

  constructor() {
  }

  ngOnInit() {
    this.keyboardEvents.subscribe(key => this.onKeypress(key));

    this.fetchValuesFromSource(this._filter);
    this.filterChange.asObservable().debounceTime(100).subscribe(value => {
      this.fetchValuesFromSource(value);
    });

    this.valuesSelected = [];
  }

  selectMulti() {
    if (this.enableMultiselect) {
      this.onValue.next(this.valuesSelected);
    }
  }

  select(value: string) {
    this.toggleSelected(value);
    if (!this.enableMultiselect) {
      this.onValue.next([value]);
    }
  }

  onKeypress(key: KeyboardEvent) {
    switch (key.code) {
      case 'ArrowDown':
        this.focusedValue = (this.focusedValue >= this.values.length - 1) ? 0 : this.focusedValue + 1;
        break;
      case 'ArrowUp':
        this.focusedValue = this.focusedValue === 0 ? this.values.length - 1 : this.focusedValue - 1;
        break;
      case 'Enter':
        if (this.values.length > 0) {
          this.select(this.values[this.focusedValue]);
        }
        break;
    }
  }

  fetchValuesFromSource(filter: string) {
    if (!this.tokenConf || !this.tokenConf.valueSource) {
      return;
    }
    if (this.valueSub) {
      this.valueSub.unsubscribe();
    }
    this.valueSub = this.tokenConf.valueSource(this.statement, filter, this.page, this.pageSize).subscribe((values) => {
      this.values = values;
    });
  }

  pageBack() {
    if (this.page > 0) {
      this.page = this.page - 1;
      this.fetchValuesFromSource(this._filter);
    }
  }

  pageForward() {
    // if there are less than the page size values we're probably on the last page.
    // or just unlucky.
    if (this.values.length === this.pageSize) {
      this.page++;
      this.fetchValuesFromSource(this._filter);
    }
  }

  isSelected(value: string) {
    return (this.valuesSelected.indexOf(value) !== -1);
  }

  toggleSelected(value: string) {
    if (this.isSelected(value)) {
      this.valuesSelected.splice(this.valuesSelected.indexOf(value), 1);
      return;
    }
    this.valuesSelected.push(value);
  }
}
