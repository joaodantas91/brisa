import type { WebContext, BrisaContext, IndicatorSignal } from '@/types';
import adaptClientToPageTranslations from '@/utils/adapt-client-to-page-translations';
import getProviderId from '@/utils/get-provider-id';
import { deserialize, serialize } from '@/utils/serialization';
import signals from '@/utils/signals';
import stylePropsToString, { lowercase } from '@/utils/style-props-to-string';

type Attr = Record<string, unknown>;
type StateSignal = { value: unknown };
type CSSValue = () => string | number;
type CSSStyles = [TemplateStringsArray, ...CSSValue[]][];
type Props = Record<string, unknown>;
type ReactiveArray = [string, Attr, Children];
type Render = {
  (props: Props, webContext: WebContext): Children;
  suspense?(props: Props, webContext: WebContext): Children;
  error?(props: Props, webContext: WebContext): Children;
};

type Children =
  | unknown[]
  | string
  | (() => Children)
  | Promise<Children>
  | { type: string; props: any };
type Event = (e: unknown) => void;

export const _on = Symbol('on');
export const _off = Symbol('off');

const W3 = 'http://www.w3.org/';
const SVG_NAMESPACE = W3 + '2000/svg';
const XLINK_NAMESPACE = W3 + '1999/xlink';
const HTML = 'HTML';
const INDICATOR = 'indicator';
const BRISA_REQUEST_CLASS = 'brisa-request';
const PORTAL = 'portal';
const SLOT_TAG = 'slot';
const KEY = 'key';
const CONNECTED_CALLBACK = 'connectedCallback';
const DISCONNECTED_CALLBACK = 'dis' + CONNECTED_CALLBACK;
const INNER_HTML = 'inner' + HTML;
const PROPS = 'p';
const SUSPENSE_PROPS = 'l';
const NULL = null;
const CONTEXT = 'context';

const isObject = (o: unknown) => typeof o === 'object';
const isReactiveArray = (a: any) => a?.some?.(isObject);
const arr = Array.from;
const isCustomEvent = (e: unknown): e is CustomEvent =>
  e instanceof CustomEvent;
const isFunction = (fn: unknown) => typeof fn === 'function';
const isAttributeAnEvent = (key: string) => key.startsWith('on');
const appendChild = (parent: HTMLElement | DocumentFragment, child: Node) =>
  parent.appendChild(child);

export default function brisaElement(
  render: Render,
  observedAttributes: string[] = [],
) {
  const $document = document;
  const $window = window;

  const createTextNode = (text: Children) => {
    if ((text as any) === false) text = '';
    return $document.createTextNode(
      (Array.isArray(text) ? text.join('') : (text ?? '')).toString(),
    );
  };

  // Change the path to the correct one, taking into account:
  // - Trailing slash
  // - i18n locale
  //
  // Note: These flags are replaced by the bundler,
  //       if they are not used their code is removed.
  if (__TRAILING_SLASH__ || __USE_LOCALE__ || __USE_PAGE_TRANSLATION__) {
    $window.fPath ??= (path: string) => {
      let res = path;
      if (__USE_LOCALE__ || __USE_PAGE_TRANSLATION__) {
        const { locales, locale, pages } = $window.i18n;
        const langInPath = res.split(/\/|#|\?/)[1];
        const includesLocale = locales.includes(langInPath);

        if (__USE_PAGE_TRANSLATION__) {
          const translation = adaptClientToPageTranslations(
            pages,
            res,
            includesLocale ? langInPath : locale,
          );
          if (translation) res = translation;
        }

        res = includesLocale ? res : '/' + locale + res;
      }
      const TRAILING_SLASH_REGEX = /\/(?=\?|#|$)/;

      if (__TRAILING_SLASH__) {
        res = res.replace(/([^/])([?#])/, '$1/$2');
        if (!res.match(TRAILING_SLASH_REGEX)) res += '/';
      } else {
        res = res.replace(TRAILING_SLASH_REGEX, '');
      }

      return res;
    };
  }

  const createElement = (
    tagName: string,
    parent?: HTMLElement | DocumentFragment,
  ) => {
    return tagName === 'svg' ||
      ((parent as HTMLElement)?.namespaceURI === SVG_NAMESPACE &&
        lowercase((parent as HTMLElement).tagName) !== 'foreignobject')
      ? $document.createElementNS(SVG_NAMESPACE, tagName)
      : $document.createElement(tagName);
  };

  const setAttribute = (el: HTMLElement, key: string, value: string) => {
    const on = (value as unknown as symbol) === _on;
    const off = (value as unknown as symbol) === _off;
    const isStyleObj = key === 'style' && isObject(value);
    let serializedValue = isStyleObj
      ? stylePropsToString(value as unknown as JSX.CSSProperties)
      : serialize(value);

    if (serializedValue === undefined) return;

    const isWithNamespace =
      el.namespaceURI === SVG_NAMESPACE &&
      (key.startsWith('xlink:') || key === 'href');

    // This code is removed by the bundler when flags are not used
    if (
      __BASE_PATH__ ||
      __TRAILING_SLASH__ ||
      __USE_LOCALE__ ||
      __USE_PAGE_TRANSLATION__ ||
      __ASSET_PREFIX__
    ) {
      if ((key === 'src' || key === 'href') && !URL.canParse(serializedValue)) {
        // Handle trailing slash + i18n locale + i18n pages
        if (
          (__TRAILING_SLASH__ || __USE_LOCALE__ || __USE_PAGE_TRANSLATION__) &&
          key === 'href'
        ) {
          serializedValue = $window.fPath(serializedValue);
        }

        // Handle asset prefix
        if (__ASSET_PREFIX__ && key === 'src') {
          serializedValue = __ASSET_PREFIX__ + serializedValue;
        }

        // Handle BASE_PATH
        if (__BASE_PATH__ && !URL.canParse(serializedValue)) {
          serializedValue = __BASE_PATH__ + serializedValue;
        }
      }
    }

    if (key === INDICATOR) {
      if (value) el.classList.add(BRISA_REQUEST_CLASS);
      else el.classList.remove(BRISA_REQUEST_CLASS);
    } else if (key === 'ref') {
      (value as unknown as StateSignal).value = el;
    } else if (isWithNamespace) {
      if (off) el.removeAttributeNS(XLINK_NAMESPACE, key);
      else el.setAttributeNS(XLINK_NAMESPACE, key, on ? '' : serializedValue);
    } else {
      if (off) el.removeAttribute(key);
      else el.setAttribute(key, on ? '' : serializedValue);
    }
  };

  const attributesLowercase: string[] = [];
  const attributesObj: Record<string, string> = {};

  observedAttributes.push(KEY);

  for (const attr of observedAttributes) {
    const lowercaseAttr = lowercase(attr);
    attributesObj[lowercaseAttr] = attributesObj[attr] = attr;
    attributesLowercase.push(lowercaseAttr);
  }

  return class extends HTMLElement {
    p: Record<string, StateSignal | Event> | undefined;
    l: Record<string, StateSignal | Event> | undefined;
    s: ReturnType<typeof signals> | undefined;

    static get observedAttributes() {
      return attributesLowercase;
    }

    static formAssociated = true;

    async [CONNECTED_CALLBACK]() {
      const self = this;
      const shadowRoot = self.shadowRoot ?? self.attachShadow({ mode: 'open' });
      const fnToExecuteAfterMount: (() => void)[] = [];
      const cssStyles: CSSStyles = [];
      const sheet = new CSSStyleSheet();
      let idCount = 0;

      // Add global CSS to apply to the shadowRoot
      const css: string[] = [];
      for (const sheet of $document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) css.push(rule.cssText);
        } catch (e) {
          // We only want to @import() when there aren't any rules, otherwise
          // it's a WICG issue:
          // https://github.com/WICG/construct-stylesheets/issues/119#issuecomment-588352418
          css.push(`@import url('${sheet.href}');`);
        }
      }
      sheet.replaceSync(css.join(''));
      shadowRoot.adoptedStyleSheets.push(sheet);

      function handlePortal(
        children: Children,
        parent: HTMLElement | DocumentFragment,
      ) {
        if ((children as any)?.[0] !== PORTAL) return [children, parent];
        const { element, target } = (children as any)[1];
        return [element, target];
      }

      async function mount(
        tagName: string | null,
        attributes: Attr,
        children: Children,
        parent: HTMLElement | DocumentFragment,
        // r: function to register subeffects to then clean them up
        r: (v: any) => any,
        effect: (v: any) => any,
        initialRender = false,
      ) {
        // Handle promises
        if ((children as Promise<Children>)?.then) {
          children = await (children as any);
        }

        if (initialRender) {
          // Reset innerHTML when using shadowRoot
          if (self.shadowRoot) {
            (self.shadowRoot as any)[INNER_HTML] = '';
          }
          // Handle CSS
          if (cssStyles.length) {
            const style = createElement('style');

            effect(() => {
              let cssString = '';

              for (const [template, ...values] of cssStyles) {
                cssString += String.raw(
                  template,
                  ...values.map((v) => (isFunction(v) ? v() : v)),
                );
              }

              style.textContent = cssString;
            });

            appendChild(shadowRoot, style);
          }
        }

        // Handle portal
        [children, parent] = handlePortal(children, parent);

        let el = (
          tagName ? createElement(tagName, parent) : parent
        ) as HTMLElement;

        // Handle attributes
        for (const [attribute, attrValue] of Object.entries(attributes)) {
          const isEvent = isAttributeAnEvent(attribute);
          const isIndicator = attribute === INDICATOR;

          if (isEvent) {
            el.addEventListener(lowercase(attribute.slice(2)), (e) =>
              (attrValue as (detail: unknown) => EventListener).apply(
                null,
                isCustomEvent(e) ? e.detail : [e],
              ),
            );
          } else if (isIndicator || (!isEvent && isFunction(attrValue))) {
            effect(
              r(() =>
                setAttribute(
                  el,
                  attribute,
                  isIndicator
                    ? (attrValue as IndicatorSignal)?.value
                    : (attrValue as any)(),
                ),
              ),
            );
          } else {
            setAttribute(el, attribute, attrValue as string);
          }
        }

        // Handle children
        if ((children as any)?.[0] === HTML) {
          (el as any)[INNER_HTML] += (children as any)[1].html as string;
        } else if (children === SLOT_TAG) {
          appendChild(el, createElement(SLOT_TAG));
        } else if (isReactiveArray(children)) {
          if (isReactiveArray((children as any)[0])) {
            for (const child of children as Children[]) {
              mount(NULL, {}, child, el, r, effect);
            }
          } else {
            mount(...(children as [string, Attr, Children]), el, r, effect);
          }
        } else if (isFunction(children)) {
          let insertedNodes: ChildNode[] | undefined;

          const insertOrUpdate = (nodes: ChildNode[]) => {
            let anchorIndex = insertedNodes?.findIndex((n) => el.contains(n))!;
            let oldNode: ChildNode | null | undefined =
              insertedNodes?.[anchorIndex];

            if (oldNode) {
              const last = insertedNodes!.at(-1)!;
              let nodeToClean;

              // If the first node is no longer in the DOM (it is "disconnected"),
              // it is necessary to clean up to fix overlapping nodes.
              // This can happen with different effects that use the same element.
              // https://github.com/brisa-build/brisa/issues/686
              while (
                anchorIndex > 0 &&
                (nodeToClean = oldNode!.previousSibling)
              ) {
                nodeToClean.remove();
              }

              oldNode.before(...nodes);

              // Remove old connected nodes #686
              while (oldNode && oldNode !== last) {
                const next = oldNode.nextSibling as ChildNode;
                oldNode.remove();
                oldNode = next;
              }

              last.remove();
            } else {
              el.append(...nodes);
            }
            insertedNodes = nodes;
          };

          effect(
            r((r2: any) => {
              const childOrPromise = (children as any)();

              function startEffect(child: Children) {
                [child, el] = handlePortal(child, el);

                const isDangerHTML = (child as any)?.[0] === HTML;

                // Fix disconnected elements #618 & #686
                if (insertedNodes && !el.parentNode) {
                  el = shadowRoot as any;
                }

                if (isDangerHTML || isReactiveArray(child)) {
                  const tempContainer = createElement(CONTEXT) as any;

                  // Reactive injected danger HTML via dangerHTML() helper
                  if (isDangerHTML) {
                    tempContainer[INNER_HTML] += (child as any)[1]
                      .html as string;
                  }
                  // Reactive child node
                  else if (isReactiveArray((child as Children[])[0])) {
                    for (const c of child as Children[]) {
                      mount(NULL, {}, c, tempContainer, r(r2), effect);
                    }
                  } else {
                    mount(
                      ...(child as ReactiveArray),
                      tempContainer,
                      r(r2),
                      effect,
                    );
                  }

                  insertOrUpdate(arr(tempContainer.childNodes) as ChildNode[]);
                }
                // Reactive text node
                else {
                  insertOrUpdate([createTextNode(child)]);
                }
              }
              if (childOrPromise instanceof Promise)
                childOrPromise.then(startEffect);
              else startEffect(childOrPromise);
            }),
          );
        } else {
          appendChild(el, createTextNode(children));
        }

        if (tagName) appendChild(parent, el);
      }

      const startRender = (
        fn: Render,
        extraProps?: { [key: string]: unknown } | null,
        renderSignals = signals(),
        propsField: 'p' | 'l' = PROPS,
      ) => {
        // Save signals to reset them later in the disconnectedCallback
        self.s = renderSignals;

        // Attributes (events and props)
        self[propsField] = {};
        for (const attr of observedAttributes) {
          self[propsField]![attributesObj[attr]] = isAttributeAnEvent(attr)
            ? self.e(attr)
            : renderSignals.state(deserialize(self.getAttribute(attr)));
        }
        const props = {
          children: [SLOT_TAG, {}, NULL],
          ...self[propsField],
          ...extraProps,
        };

        // Web context
        const webContext = {
          ...renderSignals,
          onMount(cb: () => void) {
            fnToExecuteAfterMount.push(cb);
          },
          useId() {
            return self.dataset[`id-${++idCount}`] ?? crypto.randomUUID();
          },
          // Context
          useContext<T>(context: BrisaContext<T>) {
            return renderSignals.derived(() => {
              const pId = getProviderId(self, context.id);
              return pId
                ? renderSignals.store.get(`${CONTEXT}:${context.id}:${pId}`)
                : context.defaultValue;
            });
          },
          // Handle CSS
          css(template: TemplateStringsArray, ...values: any[]) {
            cssStyles.push([template, ...values]);
          },
          i18n: $window.i18n,
          route: $window.r,
          self,
        } as unknown as WebContext;

        // This code is removed by the bundler when plugins are not used
        if (__WEB_CONTEXT_PLUGINS__) {
          for (const plugin of $window._P) {
            Object.assign(webContext, plugin(webContext));
          }
        }

        cssStyles.length = 0;
        return mount(
          NULL,
          {},
          fn(props, webContext),
          shadowRoot,
          (v: any) => v,
          renderSignals.effect,
          true,
        );
      };

      const suspenseSignals = signals();

      // Render the component
      try {
        // Handle suspense
        if (isFunction(render.suspense)) {
          await startRender(
            render.suspense!,
            NULL,
            suspenseSignals,
            SUSPENSE_PROPS,
          );
        }
        // Handle render
        await startRender(render);
        suspenseSignals.reset();
        delete self[SUSPENSE_PROPS];
      } catch (e) {
        // Handle error
        suspenseSignals.reset();
        self.s!.reset();
        if (isFunction(render.error)) {
          startRender(render.error!, { error: self.s!.state(e) });
        } else throw e;
      }
      for (const fn of fnToExecuteAfterMount) fn();
    }

    // Reset all: call cleanup, remove effects, subeffects, cleanups, etc
    [DISCONNECTED_CALLBACK]() {
      this.s?.reset();
    }

    // Handle events
    e(attribute: string) {
      return (...args: any) => {
        const ev = new CustomEvent(lowercase(attribute.slice(2)), {
          detail: isCustomEvent(args?.[0]) ? args[0].detail : args,
        });
        this.dispatchEvent(ev);
      };
    }

    attributeChangedCallback(
      name: string,
      oldValue: string | null,
      newValue: string | null,
    ) {
      const self = this as any;
      const propsField = self[SUSPENSE_PROPS] ? SUSPENSE_PROPS : PROPS;

      // unmount + mount again when the key changes
      if (name === KEY && oldValue != NULL && oldValue !== newValue) {
        self[DISCONNECTED_CALLBACK]();
        self[CONNECTED_CALLBACK]();
      }
      // Handle component props
      if (
        self[propsField] &&
        oldValue !== newValue &&
        !isAttributeAnEvent(name)
      ) {
        (self[propsField][attributesObj[name]] as StateSignal).value =
          deserialize(newValue);
      }
    }
  };
}
