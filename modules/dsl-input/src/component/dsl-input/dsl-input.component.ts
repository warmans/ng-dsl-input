import {Component, ElementRef, EventEmitter, Input, OnInit, Renderer2, ViewChild} from '@angular/core';
import {Observable} from 'rxjs/Observable';

// https://github.com/codemirror/CodeMirror/blob/master/src/input/ContentEditableInput.js
// http://codemirror.net/1/story.html
// https://www.codeproject.com/Questions/897645/Replacing-selected-text-HTML-JavaScript

@Component({
  selector: 'dsl-input',
  templateUrl: './dsl-input.component.html',
  styleUrls: ['./dsl-input.component.scss'],
})
export class DSLInputComponent implements OnInit {


  @ViewChild('editableContent')
  editableContent: ElementRef;

  @Input()
  statementConfig: StatementConfig = {
    statementFormat: ['identifier', 'comparison', 'value'],
    defaultTokenName: 'unknown',
    tokenConfig: [
      {
        name: 'identifier',
        pattern: /^[a-zA-Z][a-zA-Z0-9_]+/,
        valueSource: (context: Statement, query: string, page: number, pagesize: number): Observable<string[]> => {
          const values = [];
          for (let i = 0; i <= 100; i++) {
            values.push('foo' + i);
          }
          return Observable.of(values.filter((v) => v.indexOf(query) > -1));
        }
      },
      {
        name: 'comparison',
        pattern: /(<=|>=|=|<|>)/,
        valueSource: (context: Statement, query: string, page: number, pagesize: number): Observable<string[]> => {
          return Observable.of(['=', '<', '>', '<=', '>='].filter((v) => v.indexOf(query) > -1));
        }
      },
      {
        name: 'value',
        pattern: /([0-9]+|\"[^"]*\")/,
        valueSource: (context: Statement, query: string, page: number, pagesize: number): Observable<string[]> => {
          const values = [];
          const identVal = context.tokens[0] ? context.tokens[0].token : '';
          for (let i = 0; i <= 100; i++) {
            values.push('"' + (identVal + i) + '"');
          }
          return Observable.of(values);
        }
      }
    ]
  };

  inputActive = false;

  keyboardEvents: EventEmitter<KeyboardEvent> = new EventEmitter();

  displayDropdown = true;

  statements: Statement[] = [];
  activeToken: Token = null;
  activeStatement: Statement = null;
  predictedNextToken: TokenConfig = null;

  caretPos: number;
  contentLength: number;


  constructor(private renderer: Renderer2) {
  }

  ngOnInit(): void {
  }

  onFocus() {
    this.inputActive = true;
  }

  onClick() {
    this.inputActive = true;
    this.update();
  }

  onKeydown(key: KeyboardEvent): boolean {
    switch (key.code) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Enter':
        this.inputActive = true;
        key.preventDefault();
        return false;
      case 'Escape':
        this.inputActive = false;
    }
  }

  onKeypress(evt: KeyboardEvent) {
    this.update();
    // forward event to any other components e.g. value-list
    this.keyboardEvents.next(evt);
  }

  update() {
    this.parseInput();

    this.saveCaretPosition(this.editableContent.nativeElement);
    this.findActiveElements();

    // update UI
    this.render();
    this.moveCaretTo(this.caretPos);

  }

  insertValue() {
    const foo = this.renderer.createElement('v1');
    foo.className = 'var';
    foo.innerHTML = 'first';
    this.renderer.insertBefore(this.editableContent.nativeElement, this.editableContent.nativeElement.firstChild(), foo);
  }


  parseInput() {
    this.statements = parse(
      this.statementConfig,
      tokenize(
        this.editableContent.nativeElement.textContent,
        this.statementConfig.tokenConfig,
        this.statementConfig.defaultTokenName || 'unknown',
      )
    );
  }

  findActiveElements() {
    this.statements.forEach(stmnt => {
      stmnt.tokens.forEach(tok => {
        if (this.caretPos >= tok.start && this.caretPos <= tok.end) {
          this.activeToken = tok;
          this.activeStatement = stmnt;
        }
      });
    });
  }

  render() {
    const rendered = this.renderer.createElement('span');
    this.statements.forEach((statement) => {

      const stmntEl = this.renderer.createElement('span');
      stmntEl.className = 'statement' + (statement.error ? ' error' : '') ;

      statement.tokens.forEach((tok) => {
        const tokEl = this.renderer.createElement('span');
        tokEl.className = tok.type + (tok.invalid ? ' error' : '');
        tokEl.textContent = tok.token;
        tokEl.title = (tok.invalid ? 'invalid token: ' + statement.error : '');
        this.renderer.appendChild(stmntEl, tokEl);
      });

      this.renderer.appendChild(rendered, stmntEl);
    });

    // clear input
    this.editableContent.nativeElement.innerHTML = '';

    // update with styled content
    this.renderer.appendChild(this.editableContent.nativeElement, rendered);
  }

  moveCaretTo(position: number) {

    // move to end (no idea why it doesn't work in the normal way)
    if (this.editableContent.nativeElement.textContent.length === position) {
      let range, selection;
      range = document.createRange();
      range.selectNodeContents(this.editableContent.nativeElement);
      range.collapse(false);
      selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }

    const node = getTextNodeAtPosition(
      this.editableContent.nativeElement,
      position
    );
    const sel = window.getSelection();
    sel.collapse(node.node, node.position);
  }

  saveCaretPosition(context) {
    const range = window.getSelection().getRangeAt(0);
    const selected = range.toString().length; // *
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(context);
    preCaretRange.setEnd(range.endContainer, range.endOffset);

    if (selected) {
      this.caretPos = preCaretRange.toString().length - selected;
    } else {
      this.caretPos = preCaretRange.toString().length;
    }
    this.contentLength = context.textContent.length;
  }

  updateActiveTokenValue(value: string[]) {
    if (!this.activeToken) {
      return;
    }
    console.log('update token value');
    const strVal = value.join(',');
    this.editableContent.nativeElement.textContent = spliceString(
      this.editableContent.nativeElement.textContent,
      this.activeToken.start,
      this.activeToken.end,
      strVal,
    );

    // move caret to end of the new token
    this.moveCaretTo(this.activeToken.start + strVal.length);

    this.update();
  }
}

function getTextNodeAtPosition(root, index) {
  let lastNode = null;

  const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (elem: Node): number => {
      if (index >= elem.textContent.length) {
        index -= elem.textContent.length;
        lastNode = elem;
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const c = treeWalker.nextNode();
  return {node: (c ? c : root), position: (c ? index : 0)};
}


function tokenize(text: string, parsers: TokenConfig[], deftok: string): Token[] {
  let m, matches, l, t, tokens = [];
  while (text) {
    t = null;
    m = text.length;
    (parsers || []).concat([{name: 'whitespace', pattern: /\s+/}]).forEach(p => {
      matches = p.pattern.exec(text);
      // try to choose the best match if there are several
      // where "best" is the closest to the current starting point
      if (matches && (matches.index < m)) {
        const start = tokens.length === 0 ? 0 : tokens.map(tok => tok.token.length).reduce((prev, cur) => prev + cur);
        t = {
          token: matches[0],
          type: p.name,
          start: start,
          end: start + matches[0].length,
          conf: p,
        };
        m = matches.index;
      }
    });
    if (m) {
      // there is text between last token and currently
      // matched token - push that out as default or "unknown"
      tokens.push({
        token: text.substr(0, m),
        type: deftok || 'unknown',
      });
    }
    if (t) {
      // push current token onto sequence
      tokens.push(t);
    }
    text = text.substr(m + (t ? t.token.length : 0));
  }
  return tokens;
}

function parse(config: StatementConfig, tokens: Token[]): Statement[] {

  const statements: Statement[] = [];
  let curStatment: Statement = null;

  tokens.forEach((tok) => {

    curStatment = (curStatment === null) ? {tokens: [], error: '', conf: config} : curStatment;

    // ignore whitespace in length of statement
    const realStatementLength = curStatment.tokens.filter(t => t.type !== 'whitespace' && !t.invalid).length;

    const expectedType = config.statementFormat[realStatementLength];
    if (tok.type !== 'whitespace' && tok.type !== expectedType) {
      curStatment.error = `expected ${expectedType} but encountered ${tok.type}`;
      tok.invalid = true;
      curStatment.tokens.push(tok);
      return;
    }
    curStatment.tokens.push(tok);

    // statement is complete
    if (realStatementLength === config.statementFormat.length) {
      statements.push(curStatment);
      curStatment = null;
    }
  });

  if (curStatment !== null) {
    statements.push(curStatment);
  }

  return statements;
}

function spliceString(str: string, start: number, end: number, replace: string) {
  if (start < 0) {
    start = str.length + start;
    start = start < 0 ? 0 : start;
  }
  return str.slice(0, start) + (replace || '') + str.slice(end);
}

export type TokenValueSource = (context: Statement, query: string, page: number, pagesize: number) => Observable<string[]>;

export interface Token {
  start: number;
  end: number;
  type: string;
  token: string;
  conf?: TokenConfig;
  invalid?: boolean;
}

export interface StatementConfig {
  statementFormat: string[];
  tokenConfig: TokenConfig[];
  defaultTokenName?: string;
}

export interface TokenConfig {
  name: string;
  pattern: RegExp;
  description?: string;
  valueSource?: TokenValueSource;
}

export interface Statement {
  tokens: Token[];
  error: string;
  conf?: StatementConfig;
}
