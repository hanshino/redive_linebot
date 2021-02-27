import React from "react";
import MaterialTable from "material-table";
import PropTypes from "prop-types";
import CheckIcon from "@material-ui/icons/Check";
import CloseIcon from "@material-ui/icons/Close";
import Avatar from "@material-ui/core/Avatar";
import TableLocaliztion from "../../config/TableLocaliztion";

function genMemberAvatar(url, displayName) {
  return <Avatar src={url} alt={displayName} />;
}

const SigninTable = props => {
  const { signDatas, month } = props;

  const columns = [
    {
      title: "成員頭像",
      field: "pictureUrl",
      render: rowData => genMemberAvatar(rowData.pictureUrl, rowData.displayName),
    },
    { title: "成員姓名", field: "displayName" },
  ];

  let result = initialDatas(signDatas);

  const { dates, signDatas: displayDatas } = result;

  dates
    .filter(date => date > 23)
    .forEach(date => {
      columns.push({
        title: `${month}/${date}`,
        field: `${date}`,
        lookup: { Y: <CheckIcon color="primary" />, N: <CloseIcon color="error" /> },
      });
    });

  const SignTable = () => (
    <MaterialTable
      data={displayDatas}
      columns={columns}
      title="三刀簽到表"
      localization={TableLocaliztion}
      options={{
        pageSize: 30,
        pageSizeOptions: [10, 20, 30],
        headerStyle: { whiteSpace: "nowrap" },
      }}
    />
  );

  return <SignTable />;
};

/**
 * 整理簽到資料
 * @param {Array<{guildId: String, userId: String, signDates: Array<Number>, displayName: String}>} signDatas
 */
function initialDatas(signDatas) {
  let dates = [];
  signDatas.forEach(data => (dates = [...dates, ...data.signDates]));
  dates = [...new Set(dates)].sort();
  let result = [];

  signDatas.forEach(userData => {
    let temp = { ...userData };

    dates.forEach(date => {
      temp[date] = userData.signDates.includes(date) ? "Y" : "N";
    });

    result.push(temp);
  });

  return { dates, signDatas: result };
}

SigninTable.propTypes = {
  signDatas: PropTypes.array.isRequired,
  month: PropTypes.number.isRequired,
};

export default SigninTable;
