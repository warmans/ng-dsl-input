import {Component, ElementRef, EventEmitter, Input, OnInit, Renderer2, ViewChild} from '@angular/core';
import {Observable} from 'rxjs/Observable';

// https://github.com/codemirror/CodeMirror/blob/master/src/input/ContentEditableInput.js
// http://codemirror.net/1/story.html
// https://www.codeproject.com/Questions/897645/Replacing-selected-text-HTML-JavaScript

const spaceTok = 'whitespace';
const unknownTok = 'unknown';

@Component({
  selector: 'dsl-input',
  templateUrl: './dsl-input.component.html',
  styleUrls: ['./dsl-input.component.scss'],
})
export class DSLInputComponent implements OnInit {


  @ViewChild('editableContent')
  editableContent: ElementRef;

  @Input()
  statementConfig: StatementConfig = new StatementConfig(
    ['identifier', 'comparison', 'value'],
    [
      {
        name: 'identifier',
        pattern: /^[a-zA-Z]+[a-zA-Z0-9_]*/,
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
          const identVal = firstToken(context) ? firstToken(context).token : '';
          for (let i = 0; i <= 100; i++) {
            values.push('"' + (identVal + i) + '"');
          }
          return Observable.of(values);
        }
      }
    ]
  );

  inputActive = false;

  keyboardEvents: EventEmitter<KeyboardEvent> = new EventEmitter();

  // current state of element
  statements: Statement[] = [];
  activeToken: Token = null;
  activeStatement: Statement = null;

  // predicts what the user must input next
  predictedNextToken: Token = null;

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

    // todo: should only update if the key is a valid one (i.e. not shift or something)
    this.update();

    // forward event to any other components e.g. value-list
    this.keyboardEvents.next(evt);
  }

  update() {
    this.parseInput();

    this.saveCaretPosition(this.editableContent.nativeElement);
    this.findActiveElements();
    this.predictNextToken();

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
    this.activeToken = null;
    this.activeStatement = null;

    this.statements.forEach(stmnt => {
      stmnt.tokens.forEach(tok => {
        if (this.caretPos >= tok.start && this.caretPos <= tok.end) {
          if (tok.type !== spaceTok && tok.type !== unknownTok) {
            this.activeToken = tok;
          }
          this.activeStatement = stmnt;
        }
      });
    });

    if (!this.activeStatement) {
      this.activeStatement = this.statements[this.statements.length - 1];
    }
  }

  predictNextToken() {

    this.predictedNextToken = null;

    // if there is no active statement then this is the first token in the statement
    if (!this.activeStatement) {
      const firstToken = this.statementConfig.statementFormat[0];
      this.predictedNextToken = <Token>{
        start: this.caretPos,
        end: this.caretPos,
        type: firstToken,
        token: '',
        conf: this.statementConfig.configFor(firstToken),
      };
      return;
    }

    const realStatementLength = statementLength(this.activeStatement);

    // no more parts to statement
    if (this.statementConfig.statementFormat.length === realStatementLength) {
      return;
    }

    const nextTokenType = this.statementConfig.statementFormat[realStatementLength];
    this.predictedNextToken = <Token>{
      start: this.caretPos,
      end: this.caretPos,
      type: nextTokenType,
      token: '',
      conf: this.statementConfig.configFor(nextTokenType)
    };
  }

  render() {
    const rendered = this.renderer.createElement('span');
    this.statements.forEach((statement) => {

      const stmntEl = this.renderer.createElement('span');
      stmntEl.className = 'statement' + (statement.error ? ' error' : '') + (statement.incomplete ? ' incomplete' : '');

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

  appendToken(value: string[]) {
    this.editableContent.nativeElement.textContent += value.join(',');

    // move caret to end of the new token
    this.moveCaretTo(this.editableContent.nativeElement.textContent.length);
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
    (parsers || []).concat([{name: spaceTok, pattern: /\s+/}]).forEach(p => {
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

    // ignore whitespace in length of statement
    const realStatementLength = statementLength(curStatment);

    // statement is complete
    if (realStatementLength === config.statementFormat.length) {
      curStatment.incomplete = false;
      statements.push(curStatment);
      curStatment = null;
    }

    curStatment = (curStatment === null) ? {tokens: [], error: '', conf: config, incomplete: true} : curStatment;


    const expectedType = config.statementFormat[realStatementLength];
    if (tok.type !== spaceTok && tok.type !== expectedType) {
      curStatment.error = `expected ${expectedType} but encountered ${tok.type}`;
      tok.invalid = true;
      curStatment.tokens.push(tok);
      return;
    }
    curStatment.tokens.push(tok);

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

export class StatementConfig {
  statementFormat: string[];
  tokenConfig: TokenConfig[];
  defaultTokenName = 'unknown';

  constructor(format: string[], tokenConfig: TokenConfig[]) {
    this.statementFormat = format;
    this.tokenConfig = tokenConfig;
  }

  configFor(tokenType: string): TokenConfig {
    let conf: TokenConfig = null;
    this.tokenConfig.forEach(t => {
      if (t.name === tokenType) {
        conf = t;
      }
    });
    return conf;
  }
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
  incomplete?: boolean;
}


function statementLength(s: Statement): number {
  if (!s) {
    return 0;
  }
  let total = 0;
  s.tokens.forEach(t => {
    if (t.type !== spaceTok && !t.invalid) {
      total++;
    }
  });
  return total;
}


function firstToken(s: Statement): Token {
  if (!s) {
    return null;
  }
  let tok: Token  = null;
  s.tokens.forEach(t => {
    if (tok == null && t.type !== spaceTok && !t.invalid) {
      tok = t;
    }
  });
  return tok;
}
