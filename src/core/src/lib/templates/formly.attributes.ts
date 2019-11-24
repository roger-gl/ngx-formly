import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  Renderer2,
  DoCheck,
  Inject,
  OnDestroy,
} from '@angular/core';
import { FormlyFieldConfig, FormlyTemplateOptions } from '../models';
import { defineHiddenProp, FORMLY_VALIDATORS, observe } from '../utils';
import { DOCUMENT } from '@angular/common';

@Directive({
  selector: '[formlyAttributes]',
  host: {
    '(focus)': 'onFocus($event)',
    '(blur)': 'onBlur($event)',
    '(change)': 'onChange($event)',
  },
})
export class FormlyAttributes implements OnChanges, DoCheck, OnDestroy {
  @Input('formlyAttributes') field: FormlyFieldConfig;

  private document: Document;
  private uiAttributesCache: any = {};
  private uiAttributes = [...FORMLY_VALIDATORS, 'tabindex', 'placeholder', 'readonly', 'disabled', 'step'];
  private changeFocusState = (value: boolean) => {};

  /**
   * HostBinding doesn't register listeners conditionally which may produce some perf issues.
   *
   * Formly issue: https://github.com/ngx-formly/ngx-formly/issues/1991
   */
  private uiEvents = {
    listeners: [],
    events: ['click', 'keyup', 'keydown', 'keypress'],
  };

  get to(): FormlyTemplateOptions {
    return this.field.templateOptions || {};
  }

  private get fieldAttrElements() {
    return (this.field && this.field['_attrElements']) || [];
  }

  constructor(private renderer: Renderer2, private elementRef: ElementRef, @Inject(DOCUMENT) _document: any) {
    this.document = _document;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.field) {
      ['id', 'name'].forEach(attr => {
        this.field[attr] && this.setAttribute(attr, this.field[attr]);
      });

      this.uiEvents.listeners.forEach(listener => listener());
      this.uiEvents.events.forEach(eventName => {
        if (this.to && this.to[eventName]) {
          this.uiEvents.listeners.push(
            this.renderer.listen(this.elementRef.nativeElement, eventName, e => this.to[eventName](this.field, e)),
          );
        }
      });

      if (this.to && this.to.attributes) {
        observe(this.field, ['templateOptions', 'attributes'], ({ currentValue, previousValue }) => {
          if (previousValue) {
            Object.keys(previousValue).forEach(attr => this.removeAttribute(attr));
          }

          if (currentValue) {
            Object.keys(currentValue).forEach(attr => this.setAttribute(attr, currentValue[attr]));
          }
        });
      }

      this.attachAttrElement();
      if (this.fieldAttrElements.length === 1) {
        this.changeFocusState = observe<boolean>(this.field, ['focus'], ({ currentValue }) => {
          const element = this.fieldAttrElements ? this.fieldAttrElements[0] : null;
          if (!element) {
            return;
          }

          this.focusElement(element, currentValue);
        });
      }
    }
  }

  /**
   * We need to re-evaluate all the attributes on every change detection cycle, because
   * by using a HostBinding we run into certain edge cases. This means that whatever logic
   * is in here has to be super lean or we risk seriously damaging or destroying the performance.
   *
   * Formly issue: https://github.com/ngx-formly/ngx-formly/issues/1317
   * Material issue: https://github.com/angular/components/issues/14024
   */
  ngDoCheck() {
    this.uiAttributes.forEach(attr => {
      const value = this.to[attr];
      if (this.uiAttributesCache[attr] !== value) {
        this.uiAttributesCache[attr] = value;
        if (value || value === 0) {
          this.setAttribute(attr, value === true ? attr : `${value}`);
        } else {
          this.removeAttribute(attr);
        }
      }
    });
  }

  ngOnDestroy() {
    this.uiEvents.listeners.forEach(listener => listener());
    this.detachAttrElement();
  }

  focusElement(element, value: boolean) {
    if (!element.focus) {
      return;
    }

    const isFocused =
      !!this.document.activeElement &&
      this.fieldAttrElements.some(
        elm => this.document.activeElement === elm || elm.contains(this.document.activeElement),
      );

    if (value && !isFocused) {
      element.focus();
    } else if (!value && isFocused) {
      element.blur();
    }
  }

  onFocus($event: any) {
    this.changeFocusState(true);
    if (this.to.focus) {
      this.to.focus(this.field, $event);
    }
  }

  onBlur($event: any) {
    this.changeFocusState(false);
    if (this.to.blur) {
      this.to.blur(this.field, $event);
    }
  }

  onChange($event: any) {
    if (this.to.change) {
      this.to.change(this.field, $event);
    }

    if (this.field.formControl) {
      this.field.formControl.markAsDirty();
    }
  }

  private attachAttrElement() {
    if (this.field['_attrElements']) {
      this.field['_attrElements'].push(this.elementRef.nativeElement);
    } else {
      defineHiddenProp(this.field, '_attrElements', [this.elementRef.nativeElement]);
    }
  }

  private detachAttrElement() {
    const index = this.fieldAttrElements.findIndex(element => element !== this.elementRef.nativeElement);
    if (index !== -1) {
      this.field['_attrElements'].splice(index, 1);
    }
  }

  private setAttribute(attr: string, value: string) {
    this.renderer.setAttribute(this.elementRef.nativeElement, attr, value);
  }

  private removeAttribute(attr: string) {
    this.renderer.removeAttribute(this.elementRef.nativeElement, attr);
  }
}