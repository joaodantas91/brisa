import { ESTree } from "meriyah";
import getWebComponentAst from "../get-web-component-ast";
import getPropsNames from "../get-props-names";

export default function transformToReactiveProps(
  ast: ESTree.Program,
): [ESTree.Program, string[]] {
  const [component, defaultExportIndex] = getWebComponentAst(ast) as [
    ESTree.FunctionDeclaration,
    number,
  ];

  if (!component) return [ast, []];

  const [propsNames, renamedPropsNames] = getPropsNames(component);
  const propsNamesSet = new Set([...propsNames, ...renamedPropsNames]);
  const componentBodyWithPropsDotValue = JSON.parse(
    JSON.stringify(component.body),
    (key, value) => {
      if (value?.type === "Identifier" && propsNamesSet.has(value?.name)) {
        return {
          type: "MemberExpression",
          object: value,
          property: {
            type: "Identifier",
            name: "value",
          },
          computed: false,
        };
      }

      return value;
    },
  );

  const newAst = {
    ...ast,
    body: ast.body.map((node, index) => {
      if (index === defaultExportIndex)
        return {
          ...node,
          declaration: {
            ...(node as ESTree.ExportDefaultDeclaration).declaration,
            body: componentBodyWithPropsDotValue,
          },
        };
      return node;
    }),
  } as ESTree.Program;

  return [newAst, propsNames];
}
